import { useEffect, useMemo, useState } from "react";
import type { Arrow, Attempt, Color, Progress, Puzzle } from "./types";
import { PUZZLES } from "./data/puzzles";
import { applyUci, otherColor, parseFen } from "./lib/chess";
import { applyResult, colorName, grade, pickNext, scoreAttempt } from "./lib/scoring";
import { stepIndex } from "./lib/explain";
import { evalBeforeForFeedback } from "./lib/rank";
import { loadProgress, resetProgress, saveProgress } from "./lib/storage";
import { Board } from "./components/Board";
import { StatsBar, XpBar } from "./components/StatsBar";
import { BetterStep } from "./components/BetterStep";
import { MoveStep } from "./components/MoveStep";
import { StepFeedback } from "./components/StepFeedback";
import { ARROW_BEST, ARROW_BY_CLS, ResultPanel } from "./components/ResultPanel";

const newAttempt = (p: Puzzle): Attempt => ({
  puzzleId: p.id,
  step: "better",
  better: null,
  m1: null,
  m2: null,
  xpGain: 0,
  delta: 0,
});

function moveArrows(best: string, mine: string | null, lossMap: Record<string, number>): Arrow[] {
  // Melhor por cima (desenhado por último) para o destaque visual
  const arrows: Arrow[] = [];
  if (mine && mine !== best) {
    arrows.push({ uci: mine, color: ARROW_BY_CLS[grade(lossMap[mine] ?? 999).cls] });
  }
  arrows.push({ uci: best, color: ARROW_BEST });
  return arrows;
}

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [attempt, setAttempt] = useState<Attempt>(() => newAttempt(pickNext(PUZZLES, progress)));
  const [pending, setPending] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  /** Snapshot da tentativa pulada — permite desfazer um pulo acidental. */
  const [skipped, setSkipped] = useState<Attempt | null>(null);

  const puzzle = useMemo(() => PUZZLES.find((p) => p.id === attempt.puzzleId) ?? PUZZLES[0], [attempt.puzzleId]);
  const other = otherColor(puzzle.toMove);

  useEffect(() => saveProgress(progress), [progress]);

  const activeSide: Color = attempt.step === "m2" || attempt.step === "m2_fb" ? other : puzzle.toMove;
  useEffect(() => setFlipped(activeSide === "b"), [activeSide, attempt.puzzleId]);

  function start(p: Puzzle, clearSkip = true) {
    setAttempt(newAttempt(p));
    setPending(null);
    if (clearSkip) setSkipped(null);
  }

  function confirmMove() {
    if (!pending) return;
    setSkipped(null);
    if (attempt.step === "m1") {
      setAttempt({ ...attempt, m1: pending, step: "m1_fb" });
    } else if (attempt.step === "m2") {
      setAttempt({ ...attempt, m2: pending, step: "m2_fb" });
    }
    setPending(null);
  }

  function finishPuzzle() {
    const { s } = scoreAttempt(puzzle, attempt);
    const res = applyResult(progress, puzzle, s);
    setProgress(res.progress);
    setSkipped(null);
    setAttempt({ ...attempt, step: "result", xpGain: res.xpGain, delta: res.delta });
  }

  function skip() {
    setSkipped({ ...attempt });
    const cands = PUZZLES.filter((p) => p.id !== puzzle.id && !(p.id in progress.done));
    start(
      cands.length ? cands[Math.floor(Math.random() * cands.length)] : pickNext(PUZZLES, progress, puzzle.id),
      false,
    );
  }

  function undoSkip() {
    if (!skipped) return;
    setAttempt(skipped);
    setPending(null);
    setSkipped(null);
  }

  function handleReset() {
    if (!window.confirm("Zerar todo o progresso (rating, XP, sequência e posições resolvidas)?")) return;
    const fresh = resetProgress();
    setProgress(fresh);
    setSkipped(null);
    start(pickNext(PUZZLES, fresh));
  }

  // ---- tabuleiro ----
  let boardEl;
  if (attempt.step === "better" || attempt.step === "better_fb") {
    boardEl = <Board key={`${puzzle.id}-b`} board={parseFen(puzzle.stm.fen)} flipped={flipped} />;
  } else if (attempt.step === "m1") {
    const a = puzzle.stm;
    const base = parseFen(a.fen);
    boardEl = (
      <Board
        key={`${puzzle.id}-m1`}
        board={pending ? applyUci(base, pending) : base}
        flipped={flipped}
        legal={pending ? undefined : a.san}
        onPick={setPending}
        lastMove={pending}
      />
    );
  } else if (attempt.step === "m1_fb") {
    const a = puzzle.stm;
    boardEl = (
      <Board
        key={`${puzzle.id}-m1fb`}
        board={parseFen(a.fen)}
        flipped={flipped}
        arrows={moveArrows(a.best, attempt.m1, a.loss)}
        lastMove={attempt.m1 ?? undefined}
      />
    );
  } else if (attempt.step === "m2") {
    const a = puzzle.other;
    const base = parseFen(a.fen);
    boardEl = (
      <Board
        key={`${puzzle.id}-m2`}
        board={pending ? applyUci(base, pending) : base}
        flipped={flipped}
        legal={pending ? undefined : a.san}
        onPick={setPending}
        lastMove={pending}
      />
    );
  } else if (attempt.step === "m2_fb") {
    const a = puzzle.other;
    boardEl = (
      <Board
        key={`${puzzle.id}-m2fb`}
        board={parseFen(a.fen)}
        flipped={flipped}
        arrows={moveArrows(a.best, attempt.m2, a.loss)}
        lastMove={attempt.m2 ?? undefined}
      />
    );
  } else {
    // resultado: mostra posição real com setas do lance 1
    const a = puzzle.stm;
    boardEl = (
      <Board
        key={`${puzzle.id}-r`}
        board={parseFen(a.fen)}
        flipped={flipped}
        arrows={moveArrows(a.best, attempt.m1, a.loss)}
      />
    );
  }

  // ---- painel ----
  let panelEl;
  if (attempt.step === "better") {
    panelEl = (
      <BetterStep
        onAnswer={(c) => {
          setSkipped(null);
          setAttempt({ ...attempt, better: c, step: "better_fb" });
        }}
      />
    );
  } else if (attempt.step === "better_fb") {
    panelEl = (
      <StepFeedback
        kind="better"
        puzzle={puzzle}
        chosen={attempt.better}
        stepIdx={stepIndex(attempt.step)}
        onContinue={() => setAttempt({ ...attempt, step: "m1" })}
      />
    );
  } else if (attempt.step === "m1" || attempt.step === "m2") {
    const isFirst = attempt.step === "m1";
    const a = isFirst ? puzzle.stm : puzzle.other;
    panelEl = (
      <MoveStep
        isFirst={isFirst}
        side={isFirst ? puzzle.toMove : other}
        pendingSan={pending ? a.san[pending] : null}
        onUndo={() => setPending(null)}
        onConfirm={confirmMove}
      />
    );
  } else if (attempt.step === "m1_fb") {
    panelEl = (
      <StepFeedback
        kind="move"
        analysis={puzzle.stm}
        mine={attempt.m1}
        evalBefore={evalBeforeForFeedback(puzzle, "stm")}
        stepIdx={stepIndex(attempt.step)}
        onContinue={() => setAttempt({ ...attempt, step: "m2" })}
      />
    );
  } else if (attempt.step === "m2_fb") {
    panelEl = (
      <StepFeedback
        kind="move"
        analysis={puzzle.other}
        mine={attempt.m2}
        evalBefore={evalBeforeForFeedback(puzzle, "other")}
        stepIdx={stepIndex(attempt.step)}
        onContinue={finishPuzzle}
      />
    );
  } else {
    panelEl = (
      <ResultPanel
        puzzle={puzzle}
        attempt={attempt}
        streak={progress.streak}
        onNext={() => start(pickNext(PUZZLES, progress))}
      />
    );
  }

  return (
    <div className="wrap">
      <header>
        <div className="header-main">
          <h1>
            Leitura de <em>posição</em>
          </h1>
          <StatsBar progress={progress} total={PUZZLES.length} />
        </div>
        <button className="btn danger" type="button" onClick={handleReset} title="Apaga rating, XP e histórico">
          Zerar progresso
        </button>
      </header>
      <XpBar xp={progress.xp} />
      <main>
        <section className="boardcol">
          <div className="meta">
            <span>
              Posição <b className="mono">#{puzzle.id}</b> · rating <b className="mono">{puzzle.rating}</b>
            </span>
            <span className="tm">
              <span className={`dot ${activeSide}`} />
              Vez das {colorName(activeSide, true)}
            </span>
          </div>
          {boardEl}
          <div className="tools">
            <button className="ghost" type="button" onClick={() => setFlipped((f) => !f)}>
              Girar tabuleiro
            </button>
            <button className="ghost" type="button" onClick={skip}>
              Pular posição
            </button>
            {skipped && (
              <button className="ghost accent" type="button" onClick={undoSkip}>
                Desfazer pulo
              </button>
            )}
          </div>
        </section>
        <section className="panel" aria-live="polite">
          {panelEl}
        </section>
      </main>
      <footer>
        {PUZZLES.length} posições de partidas reais do Lichess, analisadas com Stockfish 17.1 e filtradas para ter
        material parelho, vantagem clara e melhor lance calmo para os dois lados. Classificação dos lances (perda vs
        o melhor): Melhor 0 · Excelente ≤0,20 · Bom ≤0,50 · Impreciso ≤1,00 · Erro ≤3,00 · Gafe acima. Peças: cburnett.
      </footer>
    </div>
  );
}
