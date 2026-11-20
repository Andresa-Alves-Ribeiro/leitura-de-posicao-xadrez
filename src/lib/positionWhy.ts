import type { BoardArray, Color, Puzzle } from "../types";
import { parseFen } from "./chess";
import { colorName } from "./scoring";

type Kind = "K" | "Q" | "R" | "B" | "N" | "P";

interface Sq {
  i: number;
  f: number;
  r: number;
  color: Color;
  kind: Kind;
}

function squares(board: BoardArray): Sq[] {
  const out: Sq[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    out.push({ i, f: i % 8, r: Math.floor(i / 8), color: p[0] as Color, kind: p[1] as Kind });
  }
  return out;
}

function of(side: Color, kind: Kind, sqs: Sq[]) {
  return sqs.filter((s) => s.color === side && s.kind === kind);
}

function fileHasPawn(sqs: Sq[], color: Color, file: number) {
  return sqs.some((s) => s.color === color && s.kind === "P" && s.f === file);
}

function fileStatus(sqs: Sq[], file: number, color: Color): "aberta" | "semiaberta" | null {
  const own = fileHasPawn(sqs, color, file);
  const opp = fileHasPawn(sqs, color === "w" ? "b" : "w", file);
  if (!own && !opp) return "aberta";
  if (!own && opp) return "semiaberta";
  return null;
}

function kingShield(sqs: Sq[], color: Color): number {
  const k = of(color, "K", sqs)[0];
  if (!k) return 0;
  const dir = color === "w" ? 1 : -1;
  let n = 0;
  for (const df of [-1, 0, 1]) {
    const f = k.f + df;
    const r = k.r + dir;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    const p = sqs.find((s) => s.f === f && s.r === r);
    if (p?.color === color && p.kind === "P") n++;
  }
  return n;
}

function castledLike(sqs: Sq[], color: Color): boolean {
  const k = of(color, "K", sqs)[0];
  if (!k) return false;
  const home = color === "w" ? 0 : 7;
  return k.r === home && (k.f <= 2 || k.f >= 6);
}

function centerControl(sqs: Sq[], color: Color): number {
  let score = 0;
  for (const s of sqs) {
    if (s.color !== color) continue;
    const central = s.f >= 2 && s.f <= 5 && s.r >= 2 && s.r <= 5;
    if (!central) continue;
    if (s.kind === "P") score += 2;
    else if (s.kind === "N" || s.kind === "B") score += 3;
    else if (s.kind === "R" || s.kind === "Q") score += 2;
  }
  return score;
}

function advancedKnight(sqs: Sq[], color: Color): Sq[] {
  return of(color, "N", sqs).filter((n) => {
    const depth = color === "w" ? n.r : 7 - n.r;
    if (depth < 3) return false;
    const opp = color === "w" ? "b" : "w";
    // peão inimigo pode expulsar?
    const hit = sqs.some((p) => {
      if (p.color !== opp || p.kind !== "P") return false;
      if (Math.abs(p.f - n.f) !== 1) return false;
      return color === "w" ? p.r > n.r : p.r < n.r;
    });
    return !hit;
  });
}

function spacePawns(sqs: Sq[], color: Color): number {
  return of(color, "P", sqs).reduce((acc, p) => {
    const depth = color === "w" ? p.r : 7 - p.r;
    return acc + depth;
  }, 0);
}

function doubledFiles(sqs: Sq[], color: Color): number[] {
  const counts = Array(8).fill(0);
  for (const p of of(color, "P", sqs)) counts[p.f]++;
  return counts.map((c, f) => (c >= 2 ? f : -1)).filter((f) => f >= 0);
}

function isolatedFiles(sqs: Sq[], color: Color): number[] {
  const has = Array(8).fill(false);
  for (const p of of(color, "P", sqs)) has[p.f] = true;
  const out: number[] = [];
  for (let f = 0; f < 8; f++) {
    if (!has[f]) continue;
    const left = f > 0 && has[f - 1];
    const right = f < 7 && has[f + 1];
    if (!left && !right) out.push(f);
  }
  return out;
}

function fileName(f: number) {
  return "abcdefgh"[f];
}

/**
 * Motivos concretos da vantagem nesta FEN, sem citar o melhor lance / plano a jogar.
 */
export function reasonsWhyBetter(fen: string, better: Color, material: number): string[] {
  const board = parseFen(fen);
  const sqs = squares(board);
  const worse: Color = better === "w" ? "b" : "w";
  const reasons: { score: number; text: string }[] = [];
  const who = colorName(better, true);
  const them = colorName(worse, true);

  // material
  if (Math.abs(material) >= 1) {
    const favorBetter = (material > 0 && better === "w") || (material < 0 && better === "b");
    if (favorBetter) {
      reasons.push({
        score: 40,
        text: `As ${who} têm um peão a mais (ou equivalente) — vantagem material concreta nesta posição.`,
      });
    }
  } else {
    reasons.push({
      score: 5,
      text: `O material está equilibrado; a superioridade das ${who} vem de fatores posicionais no tabuleiro.`,
    });
  }

  // bishop pair
  const bb = of(better, "B", sqs).length;
  const wb = of(worse, "B", sqs).length;
  if (bb >= 2 && wb < 2) {
    reasons.push({
      score: 28,
      text: `As ${who} têm o par de bispos, que cobre as duas cores e pressiona mais o campo adversário.`,
    });
  }

  // king safety
  const kBetter = kingShield(sqs, better);
  const kWorse = kingShield(sqs, worse);
  const cBetter = castledLike(sqs, better);
  const cWorse = castledLike(sqs, worse);
  if (cBetter && !cWorse) {
    reasons.push({
      score: 35,
      text: `O rei das ${who} já está abrigado (como após o roque), enquanto o das ${them} ainda está mais exposto no centro ou sem abrigo.`,
    });
  } else if (kBetter >= 2 && kWorse <= 1) {
    reasons.push({
      score: 30,
      text: `O rei das ${who} está melhor protegido por peões; o das ${them} tem o escudo mais frágil.`,
    });
  } else if (!cBetter && cWorse && better) {
    // worse is safer - don't claim better has safer king
  }

  // open / semi-open files with heavy pieces
  const heavyBetter = [...of(better, "R", sqs), ...of(better, "Q", sqs)];
  const openOwned: string[] = [];
  const semiOwned: string[] = [];
  for (const h of heavyBetter) {
    const st = fileStatus(sqs, h.f, better);
    if (st === "aberta") openOwned.push(fileName(h.f));
    if (st === "semiaberta") semiOwned.push(fileName(h.f));
  }
  const uniq = (a: string[]) => [...new Set(a)];
  if (uniq(openOwned).length) {
    reasons.push({
      score: 32,
      text: `As ${who} ocupam coluna${uniq(openOwned).length > 1 ? "s" : ""} aberta${uniq(openOwned).length > 1 ? "s" : ""} (${uniq(openOwned).join(", ")}), onde torre/dama ganham atividade.`,
    });
  } else if (uniq(semiOwned).length) {
    reasons.push({
      score: 26,
      text: `As ${who} têm peça pesada na coluna semiaberta ${uniq(semiOwned).join(", ")}, pressionando o campo das ${them}.`,
    });
  }

  // advanced knights / outposts
  const outs = advancedKnight(sqs, better);
  if (outs.length) {
    const names = outs.map((n) => fileName(n.f) + (n.r + 1)).join(", ");
    reasons.push({
      score: 34,
      text: `As ${who} têm cavalo${outs.length > 1 ? "s" : ""} bem avançado${outs.length > 1 ? "s" : ""} (${names}), em casa${outs.length > 1 ? "s" : ""} que peão inimigo não expulsa com facilidade.`,
    });
  }

  // queen activity / penetration
  const qB = of(better, "Q", sqs)[0];
  if (qB) {
    const depth = better === "w" ? qB.r : 7 - qB.r;
    if (depth >= 4) {
      reasons.push({
        score: 33,
        text: `A dama das ${who} já penetrou no campo adversário (${fileName(qB.f)}${qB.r + 1}), criando pressão concreta sobre peões e peças.`,
      });
    }
  }

  // space
  const spB = spacePawns(sqs, better);
  const spW = spacePawns(sqs, worse);
  if (spB - spW >= 4) {
    reasons.push({
      score: 22,
      text: `As ${who} controlam mais espaço com a cadeia de peões, restringindo as peças das ${them}.`,
    });
  }

  // center
  const cB = centerControl(sqs, better);
  const cW = centerControl(sqs, worse);
  if (cB - cW >= 4) {
    reasons.push({
      score: 24,
      text: `As ${who} estão mais presentes no centro (peões e peças menores), o que costuma decidir meio-jogos equilibrados em material.`,
    });
  }

  // weak pawns for worse side
  const iso = isolatedFiles(sqs, worse);
  const dbl = doubledFiles(sqs, worse);
  if (iso.length) {
    reasons.push({
      score: 27,
      text:
        iso.length === 1
          ? `As ${them} têm peão isolado na coluna ${fileName(iso[0])}, um alvo fácil a longo prazo.`
          : `As ${them} têm peões isolados nas colunas ${iso.map(fileName).join(", ")}, alvos fáceis a longo prazo.`,
    });
  }
  if (dbl.length) {
    reasons.push({
      score: 25,
      text: `As ${them} têm peões dobrados na coluna ${dbl.map(fileName).join(", ")}, estrutura menos flexível e mais frágil.`,
    });
  }

  // undeveloped / back-rank pieces for worse
  const home = worse === "w" ? 0 : 7;
  const undeveloped = sqs.filter(
    (s) => s.color === worse && (s.kind === "N" || s.kind === "B") && s.r === home,
  ).length;
  const developedBetter = sqs.filter(
    (s) => s.color === better && (s.kind === "N" || s.kind === "B") && s.r !== (better === "w" ? 0 : 7),
  ).length;
  if (undeveloped >= 2 && developedBetter >= 2) {
    reasons.push({
      score: 23,
      text: `Várias peças menores das ${them} ainda estão na primeira fileira, enquanto as ${who} já estão mais desenvolvidas e ativas.`,
    });
  }

  // rook count on 7th / 2nd
  const seventh = better === "w" ? 6 : 1;
  const rooks7 = of(better, "R", sqs).filter((r) => r.r === seventh);
  if (rooks7.length) {
    reasons.push({
      score: 36,
      text: `As ${who} têm torre${rooks7.length > 1 ? "s" : ""} na 7ª fileira (do ponto de vista delas), atacando peões e restringindo o rei adversário.`,
    });
  }

  reasons.sort((a, b) => b.score - a.score);
  const picked = reasons.filter((r) => r.score >= 20).slice(0, 3);
  if (picked.length === 0) {
    return [
      `Nesta posição o Stockfish favorece as ${who} por um conjunto de detalhes (atividade, espaço e segurança) mais do que por uma única ameaça óbvia.`,
    ];
  }
  // drop the weak generic material-balanced line if we have stronger reasons
  const strong = picked.filter((r) => r.score >= 22);
  return (strong.length ? strong : picked).map((r) => r.text);
}

export function explainBetterReasons(p: Puzzle): string[] {
  return reasonsWhyBetter(p.fen, p.better, p.material);
}
