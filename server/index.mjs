/**
 * Servidor da API fora do Vite, para produção (Render, Railway, Fly.io...).
 * Reaproveita o mesmo attachLichess que o vite.config.ts usa em dev.
 *
 * Variáveis de ambiente:
 *   PORT             porta (o Render define sozinho)
 *   ALLOWED_ORIGINS  origens liberadas no CORS, separadas por vírgula
 *                    (ex.: https://leitura-de-posicao-xadrez.vercel.app). Padrão: *
 *   STOCKFISH_PATH   caminho do executável do Stockfish
 *   SF_THREADS       threads do Stockfish (padrão 2)
 *   SF_TIMEOUT_MS    tempo máximo de cada análise (padrão 20000)
 *   REQUEST_BUDGET_MS  tempo máximo de uma busca inteira (padrão 75000)
 */
import http from "node:http";
import { attachLichess, warmUp } from "./novaPosicao.mjs";

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/** Imita o `server.middlewares.use(prefixo, handler)` do Vite/connect. */
const routes = [];
attachLichess({
  middlewares: {
    use: (prefix, handler) => routes.push({ prefix, handler }),
  },
});

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = http.createServer((req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/" || pathname === "/health") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("ok");
    return;
  }
  const route = routes.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!route) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Rota não encontrada.");
    return;
  }
  route.handler(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});

server.listen(PORT, () => {
  console.log(
    `API Leitura de Posição ouvindo na porta ${PORT} (${process.platform}/${process.arch}, CORS: ${ALLOWED.join(", ")})`,
  );
  // Já abre o Stockfish e o dump do Lichess, para a primeira busca não pagar esse custo.
  warmUp();
});
