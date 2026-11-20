import type { Puzzle } from "../types";
import raw from "./puzzles.json";

/** Gerado por scripts/selecionar.py — veja o README para criar mais posições. */
export const PUZZLES = raw as unknown as Puzzle[];
