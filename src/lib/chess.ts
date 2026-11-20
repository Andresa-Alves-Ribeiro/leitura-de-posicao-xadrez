import type { BoardArray, Color, Piece } from "../types";

export const FILES = "abcdefgh";

export const sqName = (i: number): string => FILES[i % 8] + (Math.floor(i / 8) + 1);
export const sqIdx = (s: string): number => (s.charCodeAt(0) - 97) + (parseInt(s[1], 10) - 1) * 8;
export const otherColor = (c: Color): Color => (c === "w" ? "b" : "w");

export function parseFen(fen: string): BoardArray {
  const board: BoardArray = new Array(64).fill(null);
  fen.split(" ")[0].split("/").forEach((row, i) => {
    const r = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += Number(ch);
        continue;
      }
      const color: Color = ch === ch.toUpperCase() ? "w" : "b";
      board[r * 8 + f] = (color + ch.toUpperCase()) as Piece;
      f++;
    }
  });
  return board;
}

/** Aplica um lance UCI só para exibição (trata roque, en passant e promoção). */
export function applyUci(board: BoardArray, uci: string): BoardArray {
  const b = board.slice();
  const from = sqIdx(uci.slice(0, 2));
  const to = sqIdx(uci.slice(2, 4));
  const p = b[from];
  if (!p) return b;

  if (p[1] === "K" && Math.abs((from % 8) - (to % 8)) === 2) {
    const r = Math.floor(from / 8);
    if (to % 8 === 6) {
      b[r * 8 + 5] = b[r * 8 + 7];
      b[r * 8 + 7] = null;
    } else {
      b[r * 8 + 3] = b[r * 8];
      b[r * 8] = null;
    }
  }
  if (p[1] === "P" && from % 8 !== to % 8 && !b[to]) {
    b[to + (p[0] === "w" ? -8 : 8)] = null;
  }
  b[to] = uci.length > 4 ? ((p[0] + uci[4].toUpperCase()) as Piece) : p;
  b[from] = null;
  return b;
}

/** Agrupa os lances legais (UCI) pela casa de origem. */
export function movesByFrom(legal: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const u of Object.keys(legal)) (out[u.slice(0, 2)] ??= []).push(u);
  return out;
}
