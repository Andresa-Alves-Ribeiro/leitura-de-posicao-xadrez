import type { Progress } from "../types";
import { PUZZLES } from "../data/puzzles";
import { lowestRating } from "./scoring";

const KEY = "leitura-posicao-v1";

export const defaultProgress = (): Progress => ({
  rating: lowestRating(PUZZLES),
  xp: 0,
  streak: 0,
  bestStreak: 0,
  done: {},
  seen: [],
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

/** Placar zerado, com o histórico intacto. `leaveId` sai da mesa e não volta. */
export function clearedProgress(prev: Progress, leaveId?: number): Progress {
  const done = { ...(prev.done ?? {}) };
  const seen = new Set((prev.seen ?? []).map(Number));
  if (leaveId != null) seen.add(leaveId);
  return {
    ...defaultProgress(),
    done,
    seen: [...seen],
    solved: Object.keys(done).length,
  };
}

/** Zera placar e mantém as posições já resolvidas, para nunca repetir. */
export function resetProgress(prev: Progress, leaveId?: number): Progress {
  const fresh = clearedProgress(prev, leaveId);
  saveProgress(fresh);
  return fresh;
}
