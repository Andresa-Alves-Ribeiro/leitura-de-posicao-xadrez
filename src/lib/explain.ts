import type { Color, Puzzle } from "../types";
import { colorName, evalSymbol, fmtEval } from "./scoring";
import { explainBetterReasons } from "./positionWhy";

export interface BetterExplain {
  ok: boolean;
  title: string;
  cls: "best" | "blunder";
  evalLabel: string;
  pct: number;
  body: string[];
}

export function explainBetter(p: Puzzle, chosen: Color | null): BetterExplain {
  const ok = chosen === p.better;
  const pct = Math.max(4, Math.min(96, 50 + p.eval / 12));
  const evalLabel = `${evalSymbol(p.eval)} ${fmtEval(p.eval)}`;
  const body: string[] = [];

  if (ok) {
    body.push(
      `As ${colorName(p.better, true)} estão melhor (${evalLabel}). Você leu a posição corretamente.`,
    );
  } else {
    body.push(
      `As ${colorName(p.better, true)} estão melhor (${evalLabel}). Você marcou ${colorName(chosen ?? "w", true)}.`,
    );
  }

  body.push(...explainBetterReasons(p));

  return {
    ok,
    title: ok ? "Leitura certa." : "Leitura trocada.",
    cls: ok ? "best" : "blunder",
    evalLabel,
    pct,
    body,
  };
}

/** Índice da StepBar (0..3) para a etapa atual. */
export function stepIndex(step: string): number {
  switch (step) {
    case "better":
    case "better_fb":
      return 0;
    case "m1":
    case "m1_fb":
      return 1;
    case "m2":
    case "m2_fb":
      return 2;
    default:
      return 3;
  }
}
