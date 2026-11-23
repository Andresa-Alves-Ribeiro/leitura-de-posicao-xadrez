import type { Color, Puzzle, SideAnalysis } from "../types";
import { explainBetter } from "../lib/explain";
import { buildMoveRank } from "../lib/rank";
import { fmtEval } from "../lib/scoring";
import { StepBar } from "./StatsBar";
import { ARROW_BY_CLS } from "./ResultPanel";

interface BetterFeedbackProps {
  kind: "better";
  puzzle: Puzzle;
  chosen: Color | null;
  stepIdx: number;
  onContinue: () => void;
}

interface MoveFeedbackProps {
  kind: "move";
  analysis: SideAnalysis;
  mine: string | null;
  evalBefore: number;
  stepIdx: number;
  onContinue: () => void;
}

export type StepFeedbackProps = BetterFeedbackProps | MoveFeedbackProps;

const LEGEND: { cls: keyof typeof ARROW_BY_CLS; label: string }[] = [
  { cls: "best", label: "Melhor" },
  { cls: "excellent", label: "Ótimo" },
  { cls: "good", label: "Bom" },
  { cls: "inaccuracy", label: "Impreciso" },
  { cls: "mistake", label: "Erro" },
  { cls: "blunder", label: "Gafe" },
];

export function StepFeedback(props: StepFeedbackProps) {
  if (props.kind === "better") {
    const x = explainBetter(props.puzzle, props.chosen);
    return (
      <>
        <div className="panel-scroll">
          <StepBar current={props.stepIdx} />
          <div className={`verdict pop fb ${x.cls}${x.cls === "blunder" ? " shake" : ""}`}>
          <div className="big">{x.title}</div>
          <div className="evalline">
            <span className="mono">{x.evalLabel}</span>
            <div className="evalbar" title="Barra de avaliação (branco = brancas)">
              <i style={{ width: `${x.pct}%` }} />
            </div>
          </div>
          {x.body.map((line, i) => (
            <p key={i} className="why fb-line">
              {line}
            </p>
          ))}
        </div>
        </div>
        <div className="gain">
          <span />
          <button className="btn" type="button" onClick={props.onContinue}>
            Continuar
          </button>
        </div>
      </>
    );
  }

  const rank = buildMoveRank(props.analysis, props.mine, props.evalBefore);
  const mySan = props.mine ? props.analysis.san[props.mine] ?? props.mine : null;

  return (
    <>
      <div className="panel-scroll">
      <StepBar current={props.stepIdx} />
      <div
        className={`verdict pop fb ${rank.grade.cls}${
          rank.grade.cls === "blunder" || rank.grade.cls === "mistake" ? " shake" : ""
        }`}
      >
        <div className="big">
        {mySan && <span>{mySan}</span>} - {rank.grade.label}
        </div>

        {rank.myRank != null && rank.myCls && (
          <p className="why fb-line rank-place">
            Seu lance está em <strong className="mono">{rank.myRank}º</strong> lugar
            {" — "}
            <span className={`cls-badge ${rank.myCls}`}>{rank.grade.label}</span>
            {!rank.myShown ? " (fora da amostra exibida)" : ""}
          </p>
        )}

        {rank.miss && (
          <div className={`miss-block ${rank.miss.cls}`}>
            <div className="best-row">
              <span className="pill-label">{rank.miss.title}</span>
              <span className={`cls-badge ${rank.miss.cls}`}>{rank.miss.chip}</span>
            </div>
            {rank.miss.lines.map((line, i) => (
              <p key={i} className="why fb-line">
                {line}
              </p>
            ))}
          </div>
        )}

        <div className="best-block">
          <div className="best-row">
            <span className="bestmv mono">{rank.bestSan} - Melhor</span>
            <span className="chip">{rank.theme}</span>
          </div>
          <span className="pill-label">Por que o melhor</span>
          <p className="why fb-line">{rank.why}</p>
          {rank.tip && <p className="why fb-line">{rank.tip}</p>}
          <div className="pv">{rank.pv}</div>
        </div>

        <div className="rank-block">
          <span className="pill-label">Ranking por classificação</span>
          <ol className="rank-list">
            {rank.groups.map((g) => (
              <li
                key={g.cls}
                className={`rank-group ${g.cls}${g.hasMine ? " mine" : ""}${g.rank === 1 ? " top" : ""}`}
              >
                <div className="rank-group-meta">
                  <span className="rank-num mono">{g.rank}º</span>
                  <span className={`cls-badge ${g.cls}`}>{g.label}</span>
                  {g.totalInClass > g.moves.length && (
                    <span className="rank-more why">+{g.totalInClass - g.moves.length}</span>
                  )}
                </div>
                <div className="rank-moves">
                  {g.moves.length === 0 ? (
                    <span className="rank-empty why">Nenhum lance nesta faixa</span>
                  ) : (
                    g.moves.map((m) => (
                      <div
                        key={m.uci}
                        className={`rank-chip${m.isMine ? " mine" : ""}`}
                        title={`${m.san}: ${fmtEval(m.evalAfter)}`}
                      >
                        <span className="rank-san mono">{m.san}</span>
                        <span className="rank-delta mono">{fmtEval(m.evalAfter)}</span>
                        {m.isMine && <span className="you-tag">você</span>}
                      </div>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="legend">
          {LEGEND.map((L) => (
            <span key={L.cls}>
              <i style={{ background: ARROW_BY_CLS[L.cls] }} />
              {L.label}
            </span>
          ))}
        </div>
      </div>
      </div>
      <div className="gain">
        <span />
        <button className="btn" type="button" onClick={props.onContinue}>
          Continuar
        </button>
      </div>
    </>
  );
}
