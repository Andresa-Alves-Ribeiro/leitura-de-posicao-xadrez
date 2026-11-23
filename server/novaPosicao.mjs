/**
 * Busca uma posição inédita no dump mensal do Lichess, no rating pedido,
 * e devolve a análise completa (os dois lados) feita pelo Stockfish local.
 */
import { spawn } from "node:child_process";
import { createZstdDecompress } from "node:zlib";
import { Readable } from "node:stream";
import path from "node:path";
import { Chess } from "chess.js";

const DUMP =
  "https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst";
const DEPTH = 10;
// No Windows usa o executável de scripts/bin; no servidor (Linux) vem de STOCKFISH_PATH.
const SF =
  process.env.STOCKFISH_PATH ||
  (process.platform === "win32" ? path.join(process.cwd(), "scripts", "bin", "stockfish.exe") : "stockfish");
const SF_THREADS = Number(process.env.SF_THREADS) || 2;
const SF_TIMEOUT_MS = Number(process.env.SF_TIMEOUT_MS) || 20000;
// Tempo máximo de uma busca inteira. Passou disso, devolve a melhor posição
// que já tiver (ou um erro claro) antes que a plataforma corte a conexão.
const BUDGET_MS = Number(process.env.REQUEST_BUDGET_MS) || 75000;

let decoder = null;
let pending = "";
let waiter = null;
let opening = null;

function pieceKey(fen) {
  return fen.split(" ")[0];
}

function openStream() {
  if (decoder) return Promise.resolve();
  if (opening) return opening;
  opening = (async () => {
    const res = await fetch(DUMP, {
      headers: { "User-Agent": "leitura-de-posicao/1.0", "Accept-Encoding": "identity" },
    });
    if (!res.ok || !res.body) throw new Error("O banco do Lichess não respondeu.");
    const reader = res.body.getReader();
    const { value: first } = await reader.read();
    if (!first) throw new Error("O banco do Lichess veio vazio.");
    const size = Buffer.from(first.slice(4, 8)).readUInt32LE(0);
    const skip = 8 + size;
    async function* gen() {
      yield Buffer.from(first.slice(skip));
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield Buffer.from(value);
      }
    }
    const dec = createZstdDecompress();
    decoder = dec;
    dec.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      dec.pause();
      deliver();
    });
    dec.on("error", (err) => {
      decoder = null;
      pending = "";
      const detail = err instanceof Error ? err.message : "erro desconhecido";
      console.error("zstd", detail);
      if (waiter) {
        const w = waiter;
        waiter = null;
        w.reject(new Error(`A leitura do banco do Lichess caiu. ${detail}`));
      }
    });
    Readable.from(gen()).pipe(dec);
  })().finally(() => {
    opening = null;
  });
  return opening;
}

function deliver() {
  if (!waiter) return;
  const cut = pending.indexOf("\n[Event ", 1);
  if (cut === -1) {
    decoder?.resume();
    return;
  }
  const game = pending.slice(0, cut);
  pending = pending.slice(cut + 1);
  const w = waiter;
  waiter = null;
  w.resolve(game);
}

function nextGame() {
  return new Promise((resolve, reject) => {
    if (!decoder) {
      reject(new Error("A leitura do banco do Lichess caiu."));
      return;
    }
    waiter = { resolve, reject };
    deliver();
  });
}

function eloOf(game) {
  const we = Number((game.match(/\[WhiteElo "(\d+)"\]/) || [])[1] || 0);
  const be = Number((game.match(/\[BlackElo "(\d+)"\]/) || [])[1] || 0);
  return { we, be };
}

function material(chess) {
  const val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let s = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.type === "k") continue;
      s += p.color === "w" ? val[p.type] : -val[p.type];
    }
  }
  return s;
}

function candidatesFrom(game, avoid) {
  const clean = game.replace(/\{[^}]*\}/g, " ");
  const chess = new Chess();
  try {
    chess.loadPgn(clean);
  } catch {
    return [];
  }
  const moves = chess.history({ verbose: true });
  const board = new Chess();
  const found = [];
  for (let i = 0; i < moves.length && i < 48; i++) {
    board.move(moves[i]);
    const ply = i + 1;
    if (ply < 22 || ply > 46) continue;
    if (board.inCheck() || board.isGameOver()) continue;
    if (Math.abs(material(board)) > 2) continue;
    if (board.board().flat().filter(Boolean).length < 12) continue;
    const fen = board.fen();
    if (avoid.has(pieceKey(fen))) continue;
    found.push(fen);
  }
  return found;
}

function flipFen(fen) {
  const chess = new Chess(fen);
  if (chess.inCheck()) return null;
  const parts = chess.fen().split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  try {
    const flipped = new Chess(parts.join(" "));
    if (flipped.inCheck()) return null;
    return flipped.fen();
  } catch {
    return null;
  }
}

// Um único processo do Stockfish, reaproveitado entre análises. Abrir o
// executável a cada análise custa caro (ele carrega a rede neural toda vez).
let engine = null;

function getEngine() {
  if (engine && !engine.dead) return engine;
  const proc = spawn(SF, [], { windowsHide: true });
  const e = { proc, buf: "", dead: false, onData: null, onExit: null };
  proc.stdout.on("data", (chunk) => {
    e.buf += chunk.toString();
    e.onData?.();
  });
  proc.stdin.on("error", () => {});
  const finish = (err) => {
    e.dead = true;
    if (engine === e) engine = null;
    e.onExit?.(err);
  };
  proc.on("exit", () => finish());
  proc.on("error", (err) => finish(err));
  proc.stdin.write("uci\n");
  proc.stdin.write(`setoption name Threads value ${SF_THREADS}\n`);
  proc.stdin.write("setoption name Hash value 16\n");
  engine = e;
  return e;
}

function waitFor(e, token, ms) {
  return new Promise((resolve, reject) => {
    const done = (fn, value) => {
      clearTimeout(timer);
      e.onData = null;
      e.onExit = null;
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error("O Stockfish demorou demais.")), ms);
    e.onData = () => {
      if (e.buf.includes(token)) done(resolve, e.buf);
    };
    e.onExit = (err) => done(reject, err || new Error("O Stockfish fechou."));
    e.onData();
  });
}

async function analyze(fen) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const n = Math.max(1, moves.length);
  const e = getEngine();
  try {
    e.buf = "";
    e.proc.stdin.write(`setoption name MultiPV value ${n}\n`);
    e.proc.stdin.write("ucinewgame\n");
    e.proc.stdin.write("isready\n");
    await waitFor(e, "readyok", SF_TIMEOUT_MS);
    e.buf = "";
    e.proc.stdin.write(`position fen ${fen}\n`);
    e.proc.stdin.write(`go depth ${DEPTH}\n`);
    const text = await waitFor(e, "bestmove ", SF_TIMEOUT_MS);
    return parseAnalysis(fen, moves, text);
  } catch (err) {
    // Descarta este processo; a próxima análise abre um novo.
    e.dead = true;
    if (engine === e) engine = null;
    e.proc.kill();
    throw err;
  }
}

/** Abre o dump do Lichess e o Stockfish antes da primeira requisição. */
export function warmUp() {
  const t0 = Date.now();
  openStream()
    .then(() => console.log(`[warmup] dump do Lichess aberto em ${Date.now() - t0} ms`))
    .catch((err) => console.error("[warmup] Lichess:", err instanceof Error ? err.message : err));
  const e = getEngine();
  e.proc.stdin.write("isready\n");
  waitFor(e, "readyok", 60000)
    .then(() => console.log(`[warmup] Stockfish pronto em ${Date.now() - t0} ms`))
    .catch((err) => console.error("[warmup] Stockfish:", err instanceof Error ? err.message : err));
}

function parseAnalysis(fen, moves, text) {
  const latest = new Map();
  for (const line of text.split("\n")) {
    if (!line.startsWith("info ") || !line.includes(` depth ${DEPTH} `) || !line.includes(" pv ")) continue;
    const multipv = Number((line.match(/ multipv (\d+)/) || [])[1] || 1);
    const mate = line.match(/ score mate (-?\d+)/);
    const cpMatch = line.match(/ score cp (-?\d+)/);
    let cp = 0;
    if (mate) {
      const n = Number(mate[1]);
      cp = Math.sign(n || 1) * (10000 - Math.min(80, Math.abs(n)));
    } else if (cpMatch) cp = Number(cpMatch[1]);
    const pv = (line.split(" pv ")[1] || "").trim().split(/\s+/).filter(Boolean);
    if (pv.length) latest.set(multipv, { cp, pv });
  }
  if (!latest.size) throw new Error("O Stockfish não devolveu análise.");
  let bestCp = -Infinity;
  let bestPv = latest.values().next().value.pv;
  for (const info of latest.values()) {
    if (info.cp > bestCp) {
      bestCp = info.cp;
      bestPv = info.pv;
    }
  }
  const loss = {};
  for (const info of latest.values()) {
    const uci = info.pv[0];
    if (uci) loss[uci] = Math.max(0, bestCp - info.cp);
  }
  const san = {};
  for (const m of moves) {
    const uci = m.from + m.to + (m.promotion || "");
    san[uci] = m.san;
    if (!(uci in loss)) loss[uci] = 800;
  }
  const chess = new Chess(fen);
  const turn = chess.turn();
  const whiteCp = turn === "w" ? bestCp : -bestCp;
  const best = bestPv[0];
  const bestSan = san[best] || best;
  const quiet = bestSan && !/[x+#]/.test(bestSan);
  const good = Object.entries(loss)
    .filter(([, l]) => l <= 40)
    .sort((a, b) => a[1] - b[1]);
  return {
    fen,
    whiteCp,
    quiet,
    best,
    bestSan,
    pv: pvSan(fen, bestPv),
    loss,
    san,
    nGood: good.length,
    goodSan: good.slice(0, 4).map(([u]) => san[u] || u),
    ...themeOf(bestSan),
  };
}

function pvSan(fen, ucis) {
  const chess = new Chess(fen);
  const parts = [];
  let num = Number(fen.split(" ")[5] || 1);
  for (const u of ucis.slice(0, 6)) {
    const turn = chess.turn();
    let mv;
    try {
      mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
    } catch {
      break;
    }
    if (!mv) break;
    if (turn === "w") parts.push(`${num}. ${mv.san}`);
    else {
      parts.push(parts.length ? mv.san : `${num}... ${mv.san}`);
      num += 1;
    }
  }
  return parts.join(" ");
}

function themeOf(san) {
  if (san === "O-O" || san === "O-O-O") {
    return { theme: "Roque", why: "Leva o rei para a segurança e conecta as torres." };
  }
  if (san && san[0] === san[0].toLowerCase()) {
    return { theme: "Avanço de peão", why: "Ganha espaço e restringe as peças adversárias." };
  }
  return { theme: "Profilaxia / melhoria", why: "Um lance calmo que melhora a posição e evita contrajogo." };
}

function sideBlock(raw) {
  return {
    fen: raw.fen,
    best: raw.best,
    bestSan: raw.bestSan,
    theme: raw.theme,
    why: raw.why,
    pv: raw.pv,
    loss: raw.loss,
    san: raw.san,
    nGood: raw.nGood,
    goodSan: raw.goodSan,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function attachLichess(server) {
  server.middlewares.use("/api/nova-posicao", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Use POST");
      return;
    }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const rating = Number(body.rating) || 500;
      const avoid = Array.isArray(body.avoid) ? body.avoid : [];
      const initial = body.initial === true;
      let gone = false;
      res.on("close", () => {
        if (!res.writableEnded) gone = true;
      });
      const puzzle = await novaPosicao(rating, avoid, initial, () => gone);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(puzzle));
    } catch (err) {
      console.error("[nova-posicao] erro:", err instanceof Error ? err.message : err);
      res.statusCode = 502;
      res.end(err instanceof Error ? err.message : "Falha ao buscar posição.");
    }
  });
}

let queue = Promise.resolve();

/** Uma posição inédita, de uma partida real perto de `rating`. */
export function novaPosicao(rating, avoidList = [], initial = false, isGone = () => false) {
  const run = queue.then(() => {
    // O navegador já desistiu (tempo esgotado, página fechada): não gasta CPU à toa.
    if (isGone()) throw new Error("Requisição cancelada pelo navegador.");
    return findPosition(rating, new Set(avoidList), initial, isGone);
  });
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}

function pack(fen, stm, other) {
  const turn = fen.split(" ")[1] === "b" ? "b" : "w";
  return {
    fen,
    eval: stm.whiteCp,
    evalOther: other.whiteCp,
    better: stm.whiteCp > 0 ? "w" : "b",
    toMove: turn,
    material: material(new Chess(fen)),
    rating: 0,
    stm: sideBlock(stm),
    other: sideBlock(other),
  };
}

const ELO_BAND = 50;

function keepCandidate(list, entry, limit, better) {
  if (list.some((item) => pieceKey(item.fen) === pieceKey(entry.fen))) return;
  list.push(entry);
  list.sort(better);
  if (list.length > limit) list.length = limit;
}

async function materialize(entry) {
  const stm = await analyze(entry.fen);
  if (Math.abs(stm.whiteCp) < 20 || Math.abs(stm.whiteCp) > 700) return null;
  const otherFen = flipFen(entry.fen);
  if (!otherFen) return null;
  const other = await analyze(otherFen);
  const puzzle = pack(entry.fen, stm, other);
  puzzle.rating = entry.rating;
  const playable = Math.abs(stm.whiteCp) >= 20 && Math.abs(stm.whiteCp) <= 700;
  const sameSide = Math.sign(stm.whiteCp) === Math.sign(other.whiteCp);
  return { puzzle, playable, ideal: Boolean(playable && stm.quiet && other.quiet && sameSide) };
}

async function findPosition(rating, avoid, initial, isGone = () => false) {
  const t0 = Date.now();
  const budgetEnd = t0 + BUDGET_MS;
  await openStream();
  const tOpen = Date.now();
  const deadline = Math.min(tOpen + (initial ? 14000 : 22000), t0 + BUDGET_MS / 3);
  const lowest = [];
  const closest = [];
  let inBand = null;
  let games = 0;
  while (Date.now() < deadline && games < 700 && !inBand && !isGone()) {
    let game;
    try {
      game = await nextGame();
    } catch {
      break;
    }
    games += 1;
    const { we, be } = eloOf(game);
    if (!we || !be) continue;
    const gameRating = Math.round((we + be) / 2);
    const near = Math.abs(we - rating) <= ELO_BAND && Math.abs(be - rating) <= ELO_BAND;
    if (!near && initial && lowest.length >= 3 && gameRating >= lowest[lowest.length - 1].rating) continue;
    if (!near && !initial && closest.length >= 3 && Math.abs(gameRating - rating) >= Math.abs(closest[closest.length - 1].rating - rating)) {
      continue;
    }
    const fens = candidatesFrom(game, avoid);
    const fen = fens[Math.floor(Math.random() * fens.length)];
    if (!fen) continue;
    const entry = { rating: gameRating, fen };
    if (near) {
      inBand = entry;
      break;
    }
    if (initial) keepCandidate(lowest, entry, 3, (a, b) => a.rating - b.rating);
    else keepCandidate(closest, entry, 3, (a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));
  }
  console.log(
    `[nova-posicao] rating ${rating}${initial ? " (início)" : ""}: abrir dump ${tOpen - t0} ms, ` +
      `${games} partidas lidas em ${Date.now() - tOpen} ms, ${inBand ? "achou na faixa" : "sem partida na faixa"}`,
  );
  const queue = [];
  if (inBand) queue.push(inBand);
  for (const entry of initial ? lowest : closest) {
    if (!queue.some((item) => item.fen === entry.fen)) queue.push(entry);
  }
  let loose = null;
  let any = null;
  for (const entry of queue) {
    if (isGone()) throw new Error("Requisição cancelada pelo navegador.");
    if (any && Date.now() > budgetEnd) break;
    const tA = Date.now();
    try {
      const built = await materialize(entry);
      console.log(`[nova-posicao] análise (rating ${entry.rating}) em ${Date.now() - tA} ms${built ? "" : " — descartada"}`);
      if (!built) continue;
      any ??= built.puzzle;
      if (built.ideal) return built.puzzle;
      if (built.playable) loose ??= built.puzzle;
      if (!inBand && built.playable) return built.puzzle;
    } catch (err) {
      console.error(`[nova-posicao] análise falhou em ${Date.now() - tA} ms:`, err instanceof Error ? err.message : err);
    }
    if (!any && Date.now() > budgetEnd) break;
  }
  console.log(`[nova-posicao] total ${Date.now() - t0} ms`);
  if (loose || any) return loose ?? any;
  throw new Error("Não achei uma posição inédita nesse rating a tempo.");
}
