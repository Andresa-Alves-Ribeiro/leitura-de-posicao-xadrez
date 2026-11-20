import type { Progress } from "../types";

const KEY = "leitura-posicao-v1";

export const defaultProgress = (): Progress => ({
  rating: 1200,
  xp: 0,
  streak: 0,
  bestStreak: 0,
  done: {},
  last: null,
  lastDelta: 0,
});

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultProgress(), ...JSON.parse(raw) };
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

export function resetProgress(): Progress {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
  return defaultProgress();
}
