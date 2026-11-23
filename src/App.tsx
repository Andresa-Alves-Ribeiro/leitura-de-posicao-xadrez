import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Arrow, Attempt, Color, Progress, Puzzle } from "./types";
import { PUZZLES } from "./data/puzzles";
import { applyUci, otherColor, parseFen } from "./lib/chess";
import { applyResult, colorName, easeRating, grade, ladderDir, level, pickNext, scoreAttempt } from "./lib/scoring";
import { stepIndex } from "./lib/explain";
import { evalBeforeForFeedback } from "./lib/rank";
import { loadProgress, resetProgress, saveProgress } from "./lib/storage";
import { Board } from "./components/Board";
import { StatsBar, XpBar } from "./components/StatsBar";
import { BetterStep } from "./components/BetterStep";
import { MoveStep } from "./components/MoveStep";
import { StepFeedback } from "./components/StepFeedback";
import { ARROW_BEST, ARROW_BY_CLS, ResultPanel } from "./components/ResultPanel";
import { Toast } from "./components/Toast";
import { ConfirmModal } from "./components/ConfirmModal";
import { difficultyOf } from "./lib/difficulty";

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
  const arrows: Arrow[] = [];
  if (mine && mine !== best) {
    arrows.push({ uci: mine, color: ARROW_BY_CLS[grade(lossMap[mine] ?? 999).cls] });
  }
  arrows.push({ uci: best, color: ARROW_BEST });
  return arrows;
}

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    const first = pickNext(PUZZLES, progress);
    return first ? newAttempt(first) : null;
  });
  const [pending, setPending] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [skipped, setSkipped] = useState<{ attempt: Attempt; progress: Progress } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "fire" | "gold" | "ok" } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const prevLevel = useRef(level(progress.xp));

  const puzzle = useMemo(
    () => (attempt ? (PUZZLES.find((p) => p.id === attempt.puzzleId) ?? null) : null),
    [attempt],
  );
  const other: Color = puzzle ? otherColor(puzzle.toMove) : "w";
  const diff = difficultyOf(puzzle?.rating ?? 0);
  const stageClass = !attempt
    ? "stage-result"
    : attempt.step === "result"
      ? "stage-result"
      : attempt.step.endsWith("_fb")
        ? "stage-feedback"
        : "stage-play";

  useEffect(() => saveProgress(progress), [progress]);

  const activeSide: Color =
    puzzle && attempt && (attempt.step === "m2" || attempt.step === "m2_fb") ? other : (puzzle?.toMove ?? "w");
  useEffect(() => setFlipped(activeSide === "b"), [activeSide, attempt?.puzzleId]);

  // No mobile, após responder, traz o painel para a vista
  useEffect(() => {
    if (!attempt) return;
    if (typeof window === "undefined" || window.matchMedia("(min-width: 900px)").matches) return;
    if (!attempt.step.endsWith("_fb") && attempt.step !== "result") return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [attempt]);

  function start(p: Puzzle, clearSkip = true) {
    setAttempt(newAttempt(p));
    setPending(null);
    if (clearSkip) setSkipped(null);
  }

  const confirmMove = useCallback(() => {
    if (!pending) return;
    setSkipped(null);
    setAttempt((a) => {
      if (!a || (a.step !== "m1" && a.step !== "m2")) return a;
      if (a.step === "m1") return { ...a, m1: pending, step: "m1_fb" };
      return { ...a, m2: pending, step: "m2_fb" };
    });
    setPending(null);
  }, [pending]);

  function finishPuzzle() {
    if (!puzzle || !attempt) return;
    const { s } = scoreAttempt(puzzle, attempt);
    const res = applyResult(progress, puzzle, s, PUZZLES);
    const nextLv = level(res.progress.xp);
    if (nextLv > prevLevel.current) {
      setToast({ message: `Subiu para o nível ${nextLv}`, tone: "gold" });
      prevLevel.current = nextLv;
    } else if (res.progress.streak === 3) {
      setToast({ message: "Sequência em chamas — bônus de XP ativo", tone: "fire" });
    } else if (res.progress.streak > 0 && res.progress.streak % 5 === 0) {
      setToast({ message: `Sequência de ${res.progress.streak} — ritmo de clube`, tone: "fire" });
    } else if (s >= 0.85) {
      setToast({ message: "Leitura brilhante nesta mesa", tone: "ok" });
    }
    setProgress(res.progress);
    setSkipped(null);
    setAttempt({ ...attempt, step: "result", xpGain: res.xpGain, delta: res.delta });
  }

  function skip() {
    if (!puzzle || !attempt) return;
    const eased = easeRating(progress, PUZZLES, puzzle.rating);
    const next = pickNext(PUZZLES, eased, puzzle.id, "down");
    if (!next) {
      setToast({ message: "Não há outra posição inédita", tone: "ok" });
      return;
    }
    setSkipped({ attempt: { ...attempt }, progress });
    setProgress(eased);
    start(next, false);
  }

  function undoSkip() {
    if (!skipped) return;
    setProgress(skipped.progress);
    setAttempt(skipped.attempt);
    setPending(null);
    setSkipped(null);
  }

  function confirmReset() {
    const fresh = resetProgress();
    setProgress(fresh);
    prevLevel.current = level(fresh.xp);
    setSkipped(null);
    setToast(null);
    setResetOpen(false);
    const first = pickNext(PUZZLES, fresh);
    if (first) start(first);
  }

  const answerBetter = useCallback((c: Color) => {
    setSkipped(null);
    setAttempt((a) => (a?.step === "better" ? { ...a, better: c, step: "better_fb" } : a));
  }, []);

  const finishRef = useRef(finishPuzzle);
  finishRef.current = finishPuzzle;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (resetOpen || !attempt || !puzzle) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (attempt.step === "better") {
        if (e.key === "1" || e.key.toLowerCase() === "b") {
          e.preventDefault();
          answerBetter("w");
        } else if (e.key === "2" || e.key.toLowerCase() === "p") {
          e.preventDefault();
          answerBetter("b");
        }
        return;
      }

      if ((attempt.step === "m1" || attempt.step === "m2") && pending) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmMove();
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          setPending(null);
        }
        return;
      }

      if (attempt.step.endsWith("_fb") || attempt.step === "result") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (attempt.step === "better_fb") setAttempt({ ...attempt, step: "m1" });
          else if (attempt.step === "m1_fb") setAttempt({ ...attempt, step: "m2" });
          else if (attempt.step === "m2_fb") finishRef.current();
          else if (attempt.step === "result") {
            const next = pickNext(PUZZLES, progress, undefined, ladderDir(progress, puzzle, PUZZLES));
            if (next) start(next);
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attempt, pending, progress, puzzle, answerBetter, confirmMove, resetOpen]);

  // ---- tabuleiro ----
  let boardEl: ReactNode = null;
  let panelEl: ReactNode = null;
  if (attempt && puzzle) {
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
  if (attempt.step === "better") {
    panelEl = <BetterStep onAnswer={answerBetter} />;
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
    const next = pickNext(PUZZLES, progress, undefined, ladderDir(progress, puzzle, PUZZLES));
    panelEl = (
      <ResultPanel
        puzzle={puzzle}
        attempt={attempt}
        streak={progress.streak}
        rating={progress.rating}
        onNext={next ? () => start(next) : undefined}
      />
    );
  }
  }

  return (
    <div className={`wrap ${stageClass}${progress.streak >= 3 ? " streak-hot" : ""}`}>
      <div className="atmosphere" aria-hidden="true" />
      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
      <header className="hud">
        <div className="brand-block">
          <p className="eyebrow">Treino posicional</p>
          <h1>
            Leitura de <em>posição</em>
          </h1>
        </div>
        <StatsBar progress={progress} />
        <button
          className="btn danger reset-btn"
          type="button"
          onClick={() => setResetOpen(true)}
          title="Apaga rating, XP e histórico"
        >
          Zerar
        </button>
      </header>
      <ConfirmModal
        open={resetOpen}
        danger
        title="Zerar o progresso?"
        body="Isso apaga rating, XP, sequência e todas as posições resolvidas. A mesa recomeça do zero — não dá para desfazer."
        confirmLabel="Zerar tudo"
        cancelLabel="Manter"
        onCancel={() => setResetOpen(false)}
        onConfirm={confirmReset}
      />
      <XpBar xp={progress.xp} />
      <main>
        {attempt && puzzle ? (
          <>
        <section className="boardcol">
          <div className="meta">
            <div className="meta-left">
              <span className="puzzle-id mono">#{puzzle.id}</span>
              <span className={`diff-chip ${diff.key}`} title={diff.hint}>
                {diff.label} · {puzzle.rating}
              </span>
            </div>
            <span className="tm">
              <span className={`dot ${activeSide}`} />
              Vez das {colorName(activeSide, true)}
            </span>
          </div>
          <div className="board-slot">
            <div className={`board-frame${pending ? " has-pending" : ""}`}>{boardEl}</div>
          </div>
          <div className="tools">
            <button className="ghost" type="button" onClick={() => setFlipped((f) => !f)}>
              Girar
            </button>
            <button className="ghost" type="button" onClick={skip}>
              Pular
            </button>
            {skipped && (
              <button className="ghost accent" type="button" onClick={undoSkip}>
                Desfazer pulo
              </button>
            )}
          </div>
        </section>
        <section className="panel" ref={panelRef} aria-live="polite">
          {panelEl}
        </section>
          </>
        ) : (
          <section className="panel">
            <h2 className="q">
              Todas as posições já foram resolvidas.
              <small>Cada uma entra uma vez só. Zerar recomeça do menor rating.</small>
            </h2>
          </section>
        )}
      </main>
      <footer>
        <p>
          {PUZZLES.length} posições de partidas reais do Lichess · Stockfish 17.1 · Melhor / Ótimo / Bom / Impreciso /
          Erro / Gafe · Peças cburnett
        </p>
        <p className="kbd-hint">
          Atalhos: <kbd>1</kbd>/<kbd>2</kbd> lado · <kbd>Enter</kbd> confirmar · <kbd>Esc</kbd> desfazer lance
        </p>
      </footer>
    </div>
  );
}
