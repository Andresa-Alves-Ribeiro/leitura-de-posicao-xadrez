import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Arrow, Attempt, Color, Progress, Puzzle } from "./types";
import { PUZZLES } from "./data/puzzles";
import { applyUci, otherColor, parseFen } from "./lib/chess";
import { applyResult, colorName, easeRating, grade, level, MIN_RATING, RATING_BAND, scoreAttempt } from "./lib/scoring";
import { stepIndex } from "./lib/explain";
import { evalBeforeForFeedback } from "./lib/rank";
import { clearedProgress, loadProgress, saveProgress } from "./lib/storage";
import { fetchLivePuzzle, loadLive, saveLive } from "./lib/livePuzzle";
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

function knownBoards(progress: Progress, live: Puzzle[]): string[] {
  return [
    ...PUZZLES.map((p) => p.fen.split(" ")[0]),
    ...(progress.boards ?? []),
    ...live.map((p) => p.fen.split(" ")[0]),
  ];
}

function inBand(positionRating: number, playerRating: number): boolean {
  return Math.abs(positionRating - playerRating) <= RATING_BAND;
}

function atStart(progress: Progress): boolean {
  const floor = Math.max(MIN_RATING, progress.floor ?? MIN_RATING);
  return progress.rating <= floor + RATING_BAND;
}

let bandRequest: { key: string; promise: Promise<Puzzle> } | null = null;

export default function App() {
  const [live, setLive] = useState<Puzzle[]>(loadLive);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    const saved = loadProgress();
    const current = loadLive().find((p) => p.id === saved.currentId);
    if (current && inBand(current.rating, saved.rating)) return newAttempt(current);
    return null;
  });
  const [pending, setPending] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [skipped, setSkipped] = useState<{ attempt: Attempt; progress: Progress } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "fire" | "gold" | "ok" } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [fetching, setFetching] = useState(() => {
    const saved = loadProgress();
    const current = loadLive().find((p) => p.id === saved.currentId);
    return !(current && inBand(current.rating, saved.rating));
  });
  const [searchAt, setSearchAt] = useState(progress.rating);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const prevLevel = useRef(level(progress.xp));
  const liveRef = useRef(live);
  liveRef.current = live;

  const puzzle = useMemo(() => {
    if (!attempt) return null;
    return live.find((p) => p.id === attempt.puzzleId) ?? PUZZLES.find((p) => p.id === attempt.puzzleId) ?? null;
  }, [attempt, live]);
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

  function adopt(found: Puzzle, base: Progress, preserveSkip = false) {
    const raised = atStart(base) && found.rating > base.rating + RATING_BAND;
    const aligned: Progress = raised ? { ...base, floor: found.rating, rating: found.rating, lastDelta: 0 } : base;
    const board = found.fen.split(" ")[0];
    const nextProgress: Progress = {
      ...aligned,
      boards: [...(aligned.boards ?? []), board],
      currentId: found.id,
    };
    const nextLive = [...liveRef.current.filter((p) => p.fen.split(" ")[0] !== board), found].slice(-40);
    saveProgress(nextProgress);
    saveLive(nextLive);
    setLive(nextLive);
    setProgress(nextProgress);
    prevLevel.current = level(nextProgress.xp);
    if (!preserveSkip) setSkipped(null);
    start(found, !preserveSkip);
  }

  async function placeLive(rating: number, base: Progress, preserveSkip = false) {
    setSearchAt(rating);
    setFetching(true);
    setFetchError(null);
    setToast(null);
    try {
      const found = await fetchLivePuzzle(rating, knownBoards(base, liveRef.current), atStart(base));
      adopt(found, base, preserveSkip);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui buscar uma posição nova no Lichess.";
      setFetchError(message);
      setToast({ message, tone: "ok" });
    } finally {
      setFetching(false);
    }
  }

  const placeRef = useRef(placeLive);
  placeRef.current = placeLive;

  useEffect(() => {
    let cancelled = false;
    const saved = loadProgress();
    const shown = loadLive().find((p) => p.id === saved.currentId);
    if (shown && inBand(shown.rating, saved.rating)) return;
    const initial = atStart(saved);
    const key = `${saved.rating}:${initial}`;
    if (!bandRequest || bandRequest.key !== key) {
      bandRequest = { key, promise: fetchLivePuzzle(saved.rating, knownBoards(saved, loadLive()), initial) };
    }
    const request = bandRequest.promise;
    setSearchAt(saved.rating);
    setFetching(true);
    setFetchError(null);
    request
      .then((found) => {
        if (!cancelled) adopt(found, saved);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Não consegui buscar uma posição nova no Lichess.";
          setFetchError(message);
          setToast({ message, tone: "ok" });
        }
      })
      .finally(() => {
        if (bandRequest?.promise === request) bandRequest = null;
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
    // Troca a posição salva quando ela ficou fora da faixa do rating atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const score = scoreAttempt(puzzle, attempt);
    const { s } = score;
    const res = applyResult(progress, puzzle, score);
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
    if (!puzzle || !attempt || fetching) return;
    const eased = easeRating(progress);
    setSkipped({ attempt: { ...attempt }, progress });
    setProgress(eased);
    void placeLive(eased.rating, eased, true);
  }

  function undoSkip() {
    if (!skipped) return;
    setProgress(skipped.progress);
    setAttempt(skipped.attempt);
    setPending(null);
    setSkipped(null);
  }

  function confirmReset() {
    setResetOpen(false);
    const fresh = clearedProgress(progress);
    void placeLive(fresh.rating, fresh);
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
            placeRef.current(progress.rating, progress);
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
    panelEl = (
      <ResultPanel
        puzzle={puzzle}
        attempt={attempt}
        streak={progress.streak}
        rating={progress.rating}
        onNext={fetching ? undefined : () => void placeLive(progress.rating, progress)}
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
          <h1>
            Leitura de <em>posição</em>
          </h1>
        </div>
        <StatsBar progress={progress} />
        <button
          className="btn danger reset-btn"
          type="button"
          onClick={() => setResetOpen(true)}
          title="Busca no Lichess uma posição nova, até 50 pontos do seu rating."
          disabled={fetching}
        >
          Zerar
        </button>
      </header>
      <ConfirmModal
        open={resetOpen}
        danger
        title="Zerar o placar?"
        body={`Isso apaga rating, XP e sequência. O rating volta para ${progress.floor || MIN_RATING}. Se não houver partida até 50 pontos disso, o início sobe para a posição mais baixa encontrada.`}
        confirmLabel="Zerar placar"
        cancelLabel="Manter"
        onCancel={() => setResetOpen(false)}
        onConfirm={confirmReset}
      />
      <XpBar xp={progress.xp} />
      {fetching && (
        <p className="fetching" role="status">
          Buscando uma posição nova no Lichess, em partidas de {searchAt - RATING_BAND} a {searchAt + RATING_BAND}…
        </p>
      )}
      <main>
        {attempt && puzzle && !fetching ? (
          <>
        <section className="boardcol">
          <div className="meta">
            <div className="meta-left">
              <span className="puzzle-id mono">#{puzzle.id}</span>
              <span
                className={`diff-chip ${diff.key}`}
                title={`${diff.hint}. É a dificuldade desta posição, separada do seu rating.`}
              >
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
            <button className="ghost" type="button" onClick={skip} disabled={fetching}>
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
        ) : fetchError ? (
          <section className="panel">
            <h2 className="q">
              Não consegui trazer uma posição na sua faixa.
              <small>{fetchError}</small>
            </h2>
            <button className="btn" type="button" onClick={() => void placeLive(progress.rating, progress)}>
              Tentar de novo
            </button>
          </section>
        ) : fetching ? (
          <section className="panel">
            <h2 className="q">
              Buscando uma posição na sua faixa.
              <small>
                Partidas entre {searchAt - RATING_BAND} e {searchAt + RATING_BAND}. Se não houver, entra a mais baixa e o início acompanha.
              </small>
            </h2>
          </section>
        ) : (
          <section className="panel">
            <h2 className="q">
              Todas as posições já foram resolvidas.
              <small>Cada uma entra uma vez só. Zerar busca no Lichess uma posição inédita, até 50 pontos do rating {MIN_RATING}.</small>
            </h2>
          </section>
        )}
      </main>
      <footer>
        <p>
          Stockfish 17.1 · Melhor / Ótimo / Bom / Impreciso /
          Erro / Gafe · Peças cburnett
        </p>
        <p className="kbd-hint">
          Atalhos: <kbd>1</kbd>/<kbd>2</kbd> lado · <kbd>Enter</kbd> confirmar · <kbd>Esc</kbd> desfazer lance
        </p>
      </footer>
    </div>
  );
}
