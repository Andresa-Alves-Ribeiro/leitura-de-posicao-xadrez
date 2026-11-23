import type { Attempt, Color, Progress, Puzzle } from "../types";

/** Classificação estilo Chess.com (faixas por perda em centipeões). */
export type GradeCls = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface Grade {
  label: string;
  pts: number;
  cls: GradeCls;
}

const GRADES: { max: number; grade: Grade }[] = [
  { max: 0, grade: { cls: "best", label: "Melhor", pts: 1 } },
  { max: 20, grade: { cls: "excellent", label: "Excelente", pts: 0.9 } },
  { max: 50, grade: { cls: "good", label: "Bom", pts: 0.75 } },
  { max: 100, grade: { cls: "inaccuracy", label: "Impreciso", pts: 0.4 } },
  { max: 300, grade: { cls: "mistake", label: "Erro", pts: 0.15 } },
];

/** Nota pela perda (em centipeões) em relação ao melhor lance. Empates de faixa = mesmo label. */
export function grade(loss: number): Grade {
  const L = Math.max(0, loss);
  for (const g of GRADES) {
    if (L <= g.max) return g.grade;
  }
  return { cls: "blunder", label: "Gafe", pts: 0 };
}

export interface AttemptScore {
  betterOk: boolean;
  g1: Grade;
  g2: Grade;
  s: number; // 0..1
}

export function scoreAttempt(p: Puzzle, a: Attempt): AttemptScore {
  const g1 = grade(p.stm.loss[a.m1 ?? ""] ?? 999);
  const g2 = grade(p.other.loss[a.m2 ?? ""] ?? 999);
  const betterOk = a.better === p.better;
  return { betterOk, g1, g2, s: ((betterOk ? 1 : 0) + g1.pts + g2.pts) / 3 };
}

export const fmtEval = (cp: number): string =>
  (cp > 0 ? "+" : cp < 0 ? "−" : "") + (Math.abs(cp) / 100).toFixed(2).replace(".", ",");

export const fmtLoss = (cp: number): string => (cp / 100).toFixed(2).replace(".", ",");

/** Delta de avaliação do lance vs o melhor (sempre ≤ 0). */
export function fmtDelta(cp: number): string {
  if (cp === 0) return "0,00";
  const sign = cp > 0 ? "+" : "−";
  return sign + (Math.abs(cp) / 100).toFixed(2).replace(".", ",");
}

/** Símbolos de avaliação do Informator. */
export function evalSymbol(cp: number): string {
  if (Math.abs(cp) < 150) return cp > 0 ? "⩲" : "⩱";
  return cp > 0 ? "±" : "∓";
}

export const XP_PER_LEVEL = 250;
export const level = (xp: number): number => Math.floor(xp / XP_PER_LEVEL) + 1;

/** Atualiza rating (Elo), sequência e XP depois de um problema. */
export function applyResult(prev: Progress, p: Puzzle, s: number) {
  const first = !(p.id in prev.done);
  const expected = 1 / (1 + Math.pow(10, (p.rating - prev.rating) / 400));
  const K = first ? 32 : 12;
  const delta = Math.round(K * (s - expected));
  const streak = s >= 0.6 ? prev.streak + 1 : 0;
  const xpGain = Math.round((10 + 60 * s + (streak >= 3 ? 15 : 0)) * (first ? 1 : 0.5));
  const progress: Progress = {
    ...prev,
    rating: prev.rating + delta,
    lastDelta: delta,
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    xp: prev.xp + xpGain,
    done: { ...prev.done, [p.id]: Math.round(s * 100) },
    solved: (prev.solved ?? Object.keys(prev.done).length) + 1,
    last: p.id,
  };
  return { progress, delta, xpGain };
}

/** Próximo problema: o não resolvido com rating mais perto do jogador. */
export function pickNext(puzzles: Puzzle[], progress: Progress, exclude?: number): Puzzle {
  const unsolved = puzzles.filter((p) => !(p.id in progress.done) && p.id !== exclude);
  const pool = unsolved.length ? unsolved : puzzles.filter((p) => p.id !== progress.last && p.id !== exclude);
  return [...pool].sort(
    (a, b) => Math.abs(a.rating - progress.rating) - Math.abs(b.rating - progress.rating),
  )[0] ?? puzzles[0];
}

export const colorName = (c: Color, lower = false): string =>
  lower ? (c === "w" ? "brancas" : "pretas") : c === "w" ? "Brancas" : "Pretas";
