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
  { max: 20, grade: { cls: "excellent", label: "Ótimo", pts: 0.9 } },
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

/** Delta de avaliação em peões, com sinal. */
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

/** Nota média que conta como acerto — o mesmo corte da sequência. */
export const PASS_SCORE = 0.6;

export type RatingDir = "up" | "down";

/** Piso do placar. Zerar e o fim da descida param aqui. */
export const MIN_RATING = 500;

/** A posição pode vir de partidas até esta distância do rating do jogador. */
export const RATING_BAND = 50;

/** Cada uma das três respostas move o rating neste tanto, do acerto pleno à gafe. */
export const RATING_PER_ANSWER = 16;

/** Menor rating do placar. */
export function lowestRating(_puzzles?: Puzzle[]): number {
  return MIN_RATING;
}

function ratingSteps(puzzles: Puzzle[]): number[] {
  return [...new Set(puzzles.map((p) => p.rating))].sort((a, b) => a - b);
}

/** Próximo degrau que existe. No topo ou no chão, permanece. */
export function stepRating(puzzles: Puzzle[], from: number, dir: RatingDir): number {
  const steps = ratingSteps(puzzles).filter((r) => r >= MIN_RATING);
  const base = Math.max(from, MIN_RATING);
  if (!steps.length) return MIN_RATING;
  if (dir === "up") return steps.find((r) => r > base) ?? steps[steps.length - 1];
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] < base) return steps[i];
  }
  return MIN_RATING;
}

/** Sentido depois de um resultado, inclusive quando o degrau não se move. */
export function ladderDir(progress: Progress, puzzle: Puzzle, puzzles: Puzzle[]): RatingDir {
  if (progress.rating > puzzle.rating) return "up";
  if (progress.rating < puzzle.rating) return "down";
  return progress.rating <= lowestRating(puzzles) ? "down" : "up";
}

/** De -1 (gafe) a +1 (melhor lance), na proporção da nota da resposta. */
function answerSwing(pts: number): number {
  return Math.min(1, Math.max(0, pts)) * 2 - 1;
}

/**
 * Soma das três respostas. Cada uma vale ±RATING_PER_ANSWER:
 * quem está melhor é certo ou errado; os dois lances seguem a nota da perda.
 */
export function ratingDelta(betterOk: boolean, movePts: number, otherPts: number): number {
  const swing = (betterOk ? 1 : -1) + answerSwing(movePts) + answerSwing(otherPts);
  return Math.round(RATING_PER_ANSWER * swing);
}

/** Piso efetivo: 500, ou o início já ajustado para a posição mais baixa encontrada. */
export function ratingFloor(progress?: { floor?: number }): number {
  const floor = progress?.floor;
  return Math.max(MIN_RATING, typeof floor === "number" && floor > 0 ? floor : MIN_RATING);
}

/** Desce o valor de uma resposta errada. Não mexe em XP, sequência nem histórico. */
export function easeRating(prev: Progress): Progress {
  const rating = Math.max(ratingFloor(prev), prev.rating - RATING_PER_ANSWER);
  return { ...prev, rating, lastDelta: rating - prev.rating };
}

/** Sobe ou desce na proporção das três respostas. XP e sequência continuam iguais. */
export function applyResult(prev: Progress, p: Puzzle, score: AttemptScore) {
  const { s, betterOk, g1, g2 } = score;
  const first = !(p.id in prev.done);
  const success = s >= PASS_SCORE;
  const rating = Math.max(ratingFloor(prev), prev.rating + ratingDelta(betterOk, g1.pts, g2.pts));
  const delta = rating - prev.rating;
  const streak = success ? prev.streak + 1 : 0;
  const xpGain = Math.round((10 + 60 * s + (streak >= 3 ? 15 : 0)) * (first ? 1 : 0.5));
  const progress: Progress = {
    ...prev,
    rating,
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

function closer(target: number) {
  return (a: Puzzle, b: Puzzle) => Math.abs(a.rating - target) - Math.abs(b.rating - target) || a.id - b.id;
}

function inDir(p: Puzzle, target: number, dir: RatingDir | "any"): boolean {
  if (dir === "up") return p.rating >= target;
  if (dir === "down") return p.rating <= target;
  return true;
}

/**
 * Próximo problema inédito no degrau da meta.
 * Se esse sentido já acabou, segue para outro inédito. Nunca repete um resolvido.
 */
export function pickNext(
  puzzles: Puzzle[],
  progress: Progress,
  exclude?: number,
  dir: RatingDir | "any" = "any",
): Puzzle | null {
  const target = progress.rating;
  const fresh = puzzles.filter((p) => !(p.id in progress.done) && p.id !== exclude);
  const aimed = fresh.filter((p) => inDir(p, target, dir)).sort(closer(target));
  if (aimed.length) return aimed[0];
  const rest = [...fresh].sort(closer(target));
  return rest[0] ?? null;
}

/** Inédita de menor rating. Só fica de fora o que já foi resolvido. */
export function pickLowestFresh(puzzles: Puzzle[], progress: Progress): Puzzle | null {
  const fresh = puzzles.filter((p) => !(p.id in progress.done));
  fresh.sort((a, b) => a.rating - b.rating || a.id - b.id);
  return fresh[0] ?? null;
}

export const colorName = (c: Color, lower = false): string =>
  lower ? (c === "w" ? "brancas" : "pretas") : c === "w" ? "Brancas" : "Pretas";
