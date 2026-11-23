import type { Attempt, Puzzle } from "../types";
import { colorName, scoreAttempt, type GradeCls } from "../lib/scoring";
import { otherColor } from "../lib/chess";
import { StepBar } from "./StatsBar";
import { ScoreRing } from "./ScoreRing";

export type ResultTab = "stm" | "other";

interface ResultPanelProps {
  puzzle: Puzzle;
  attempt: Attempt;
  streak: number;
  rating: number;
  onNext?: () => void;
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

export function ResultPanel({ puzzle: p, attempt, streak, rating, onNext }: ResultPanelProps) {
  const r = scoreAttempt(p, attempt);
  const other = otherColor(p.toMove);
  const pct = Math.round(r.s * 100);
  const headline = pct >= 85 ? "Brilhante!" : pct >= 60 ? "Boa sessão." : "Segue treinando.";
  const ringLabel = pct >= 85 ? "Leitura afiada" : pct >= 60 ? "No caminho" : "Mais uma mesa";
  const climbed = attempt.delta > 0;
  const fromRating = rating - attempt.delta;

  return (
    <>
      <StepBar current={3} />
      <div className="verdict pop result-hero">
        <ScoreRing pct={pct} label={ringLabel} />
        <div className="result-copy">
          <div className="big">{headline}</div>
          <div className="why">Placar das três respostas desta posição.</div>
          {streak >= 3 && (
            <span className="streak-pill" title="Bônus de XP ativo">
              Sequência {streak} · em chamas
            </span>
          )}
        </div>
      </div>

      {climbed && (
        <div
          className="rating-climb"
          role="status"
          aria-label={`Você subiu ${attempt.delta} de rating, de ${fromRating} para ${rating}`}
        >
          <strong className="rating-climb-delta">+{attempt.delta}</strong>
          <div className="rating-climb-copy">
            <span className="rating-climb-kicker">Você subiu de rating</span>
            <span className="rating-climb-path">
              <span className="mono rating-climb-from">{fromRating}</span>
              <span className="rating-climb-arrow" aria-hidden="true">
                →
              </span>
              <span className="mono rating-climb-now">{rating}</span>
            </span>
          </div>
        </div>
      )}

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
        <span className="mono gain-stats">
          {pct}% · +{attempt.xpGain} XP
          {attempt.delta < 0 ? ` · ${attempt.delta} rating` : ""}
          {streak >= 3 ? ` · seq. ${streak}` : ""}
        </span>
        {onNext ? (
          <button className="btn pulse" type="button" onClick={onNext}>
            Próxima posição
          </button>
        ) : (
          <p className="why">Você já resolveu todas as posições.</p>
        )}
      </div>
    </>
  );
}
