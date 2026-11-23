import type { Progress } from "../types";
import { PUZZLES } from "../data/puzzles";
import { lowestRating, MIN_RATING } from "./scoring";

const KEY = "leitura-posicao-v1";

export const defaultProgress = (): Progress => ({
  rating: lowestRating(PUZZLES),
  floor: MIN_RATING,
  xp: 0,
  streak: 0,
  bestStreak: 0,
  done: {},
  seen: [],
  boards: [],
  currentId: null,
  solved: 0,
  last: null,
  lastDelta: 0,
});

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Progress>;
      const parsed = { ...defaultProgress(), ...data };
      if (typeof data.solved !== "number") {
        parsed.solved = Object.keys(parsed.done ?? {}).length;
      }
      parsed.seen = Array.isArray(data.seen) ? data.seen.map(Number).filter((id) => Number.isFinite(id)) : [];
      parsed.boards = Array.isArray(data.boards) ? data.boards.filter((fen) => typeof fen === "string") : [];
      parsed.currentId = typeof data.currentId === "number" ? data.currentId : null;
      parsed.floor = typeof data.floor === "number" && data.floor >= MIN_RATING ? data.floor : MIN_RATING;
      if (parsed.rating < parsed.floor) parsed.rating = parsed.floor;
      return parsed;
    }
  } catch {
    /* localStorage indisponível */
  }
  return defaultProgress();
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignora */
  }
}

/** Placar zerado, com o histórico de posições intacto. */
export function clearedProgress(prev: Progress): Progress {
  const done = { ...(prev.done ?? {}) };
  const floor = Math.max(MIN_RATING, prev.floor ?? MIN_RATING);
  return {
    ...defaultProgress(),
    rating: floor,
    floor,
    done,
    boards: [...(prev.boards ?? [])],
    solved: Object.keys(done).length,
  };
}

/** Zera o placar no rating inicial e mantém as posições já usadas. */
export function resetProgress(prev: Progress): Progress {
  const fresh = clearedProgress(prev);
  saveProgress(fresh);
  return fresh;
}
