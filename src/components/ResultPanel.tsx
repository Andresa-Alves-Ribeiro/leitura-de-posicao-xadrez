import type { Attempt, Puzzle } from "../types";
import { colorName, scoreAttempt, type GradeCls } from "../lib/scoring";
import { otherColor } from "../lib/chess";
import { StepBar } from "./StatsBar";

export type ResultTab = "stm" | "other";

interface ResultPanelProps {
  puzzle: Puzzle;
  attempt: Attempt;
  streak: number;
  onNext: () => void;
}

/** Cores das setas / badges — alinhadas à escala Chess.com. */
export const ARROW_BEST = "#81b64c";
export const ARROW_EXCELLENT = "#5fae6c";
export const ARROW_GOOD = "#5eb4d6";
export const ARROW_INACCURACY = "#e3b04f";
export const ARROW_MISTAKE = "#e88b4b";
export const ARROW_BLUNDER = "#d9604f";

export const ARROW_BY_CLS: Record<GradeCls, string> = {
  best: ARROW_BEST,
  excellent: ARROW_EXCELLENT,
  good: ARROW_GOOD,
  inaccuracy: ARROW_INACCURACY,
  mistake: ARROW_MISTAKE,
  blunder: ARROW_BLUNDER,
};

export function ResultPanel({ puzzle: p, attempt, streak, onNext }: ResultPanelProps) {
  const r = scoreAttempt(p, attempt);
  const other = otherColor(p.toMove);

  return (
    <>
      <StepBar current={3} />
      <div className="verdict pop">
        <div className="big">Posição concluída.</div>
        <div className="why">Resumo das três respostas desta posição.</div>
      </div>

      <div className="res summary">
        <div className={`card ${r.betterOk ? "best" : "blunder"}`}>
          <h3>
            <span>Quem está melhor</span>
          </h3>
          <div className="you">
            {r.betterOk ? (
              <span className="g">Certo — {colorName(p.better)}</span>
            ) : (
              <span className="g">
                Errado — eram {colorName(p.better, true)}; você marcou {colorName(attempt.better ?? "w", true)}
              </span>
            )}
          </div>
        </div>
        <div className={`card ${r.g1.cls}`}>
          <h3>
            <span>Vez das {colorName(p.toMove, true)}</span>
          </h3>
          <div className="you">
            <span className="g">{p.stm.san[attempt.m1 ?? ""] ?? "—"}</span>{" "}
            <span className={`cls-badge ${r.g1.cls}`}>{r.g1.label}</span>
          </div>
        </div>
        <div className={`card ${r.g2.cls}`}>
          <h3>
            <span>Se fosse das {colorName(other, true)}</span>
          </h3>
          <div className="you">
            <span className="g">{p.other.san[attempt.m2 ?? ""] ?? "—"}</span>{" "}
            <span className={`cls-badge ${r.g2.cls}`}>{r.g2.label}</span>
          </div>
        </div>
      </div>

      <div className="gain">
        <span className="mono">
          {Math.round(r.s * 100)}% · {attempt.delta >= 0 ? "+" : ""}
          {attempt.delta} rating · +{attempt.xpGain} XP{streak >= 3 ? ` · sequência de ${streak}` : ""}
        </span>
        <button className="btn" type="button" onClick={onNext}>
          Próxima posição
        </button>
      </div>
    </>
  );
}
