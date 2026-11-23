import type { Color, Puzzle, SideAnalysis } from "../types";
import { grade, type GradeCls } from "./scoring";
import { explainMiss, type MissExplain } from "./explainMiss";

/** Ordem fixa do ranking por classificação (1º Melhor … 6º Gafe). */
export const CLS_ORDER: GradeCls[] = [
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
];

const CLS_RANK: Record<GradeCls, number> = {
  best: 1,
  excellent: 2,
  good: 3,
  inaccuracy: 4,
  mistake: 5,
  blunder: 6,
};

const CLS_LABEL: Record<GradeCls, string> = {
  best: "Melhor",
  excellent: "Ótimo",
  good: "Bom",
  inaccuracy: "Impreciso",
  mistake: "Erro",
  blunder: "Gafe",
};

const MAX_PER_CLS = 3;

export interface RankMove {
  uci: string;
  san: string;
  loss: number;
  evalAfter: number;
  delta: number;
  isMine: boolean;
}

export interface RankGroup {
  rank: number;
  cls: GradeCls;
  label: string;
  moves: RankMove[];
  hasMine: boolean;
  /** Total de lances nessa faixa (pode ser > 3). */
  totalInClass: number;
}

export interface MoveRank {
  groups: RankGroup[];
  myRank: number | null;
  myCls: GradeCls | null;
  myShown: boolean;
  evalBefore: number;
  evalAfter: number;
  grade: ReturnType<typeof grade>;
  theme: string;
  why: string;
  pv: string;
  bestSan: string;
  tip: string | null;
  /** Explicação técnica do lance do usuário (só impreciso / erro / gafe). */
  miss: MissExplain | null;
}

function isTacticalSan(san: string): boolean {
  return /x|\+|\#|=/.test(san);
}

/** Vez indicada no FEN da análise. */
export function sideFromFen(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/**
 * Nota depois do lance, na escala da barrinha (brancas positivo, pretas negativo).
 * Perda das brancas desce o número; perda das pretas sobe.
 */
export function evalAfterMove(evalBeforeWhite: number, loss: number, side: Color): number {
  return side === "w" ? evalBeforeWhite - loss : evalBeforeWhite + loss;
}

/** Avaliação da posição já no ponto de vista das brancas. Não inverte para quem joga. */
export function evalBeforeForFeedback(p: Puzzle, which: "stm" | "other"): number {
  return which === "stm" ? p.eval : p.evalOther;
}

function pickUpTo3(
  moves: RankMove[],
  mineUci: string | null,
): { shown: RankMove[]; shownMine: boolean } {
  const sorted = [...moves].sort((a, b) => a.loss - b.loss || a.san.localeCompare(b.san));
  let shown = sorted.slice(0, MAX_PER_CLS);
  const mine = mineUci ? sorted.find((m) => m.uci === mineUci) : undefined;
  if (mine && !shown.some((m) => m.uci === mine.uci)) {
    // Garante o lance do usuário entre os 3 (substitui o pior da amostra)
    shown = [...shown.slice(0, MAX_PER_CLS - 1), mine];
  }
  return { shown, shownMine: !!mine && shown.some((m) => m.uci === mine.uci) };
}

/**
 * Ranking por classificação: cada faixa é um lugar (1º–6º),
 * com até 3 lances lado a lado. A nota de cada lance é a avaliação
 * Stockfish depois dele, na escala das brancas.
 */
export function buildMoveRank(
  a: SideAnalysis,
  mineUci: string | null,
  evalBefore: number,
): MoveRank {
  const side = sideFromFen(a.fen);
  const all: RankMove[] = Object.keys(a.loss).map((uci) => {
    const loss = a.loss[uci];
    const evalAfter = evalAfterMove(evalBefore, loss, side);
    return {
      uci,
      san: a.san[uci] ?? uci,
      loss,
      evalAfter,
      delta: evalAfter - evalBefore,
      isMine: mineUci === uci,
    };
  });

  const byCls = new Map<GradeCls, RankMove[]>();
  for (const m of all) {
    const cls = grade(m.loss).cls;
    const list = byCls.get(cls) ?? [];
    list.push(m);
    byCls.set(cls, list);
  }

  const groups: RankGroup[] = [];
  let myShown = false;
  for (const cls of CLS_ORDER) {
    const list = byCls.get(cls) ?? [];
    const { shown, shownMine } = pickUpTo3(list, mineUci);
    if (shownMine) myShown = true;
    groups.push({
      rank: CLS_RANK[cls],
      cls,
      label: CLS_LABEL[cls],
      moves: shown,
      hasMine: shown.some((m) => m.isMine),
      totalInClass: list.length,
    });
  }

  const myMove = mineUci ? all.find((m) => m.uci === mineUci) : undefined;
  const myCls = myMove ? grade(myMove.loss).cls : null;
  const myRank = myCls ? CLS_RANK[myCls] : null;

  const loss = myMove?.loss ?? 0;
  const g = grade(myMove ? loss : 0);
  const evalAfter = myMove ? myMove.evalAfter : evalBefore;

  let tip: string | null = null;
  if (myMove && mineUci !== a.best) {
    if (isTacticalSan(myMove.san) && !isTacticalSan(a.bestSan)) {
      tip = "A posição pedia um lance calmo de plano; capturar, promover ou dar xeque aqui perde avaliação.";
    }
  }

  const miss = explainMiss(a, mineUci, evalBefore);

  return {
    groups,
    myRank,
    myCls,
    myShown,
    evalBefore,
    evalAfter,
    grade: g,
    theme: a.theme,
    why: a.why,
    pv: a.pv,
    bestSan: a.bestSan,
    tip,
    miss,
  };
}
