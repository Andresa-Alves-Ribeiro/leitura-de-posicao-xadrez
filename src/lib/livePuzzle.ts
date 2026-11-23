import type { Puzzle } from "../types";

const KEY = "leitura-posicao-live-v1";

export function loadLive(): Puzzle[] {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(data) ? (data as Puzzle[]) : [];
  } catch {
    return [];
  }
}

export function saveLive(puzzles: Puzzle[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(puzzles.slice(-40)));
  } catch {
    /* ignora */
  }
}

/**
 * Endereço do servidor da API. Em dev fica vazio (o próprio Vite responde /api);
 * em produção vem de VITE_API_URL, definida nas variáveis de ambiente da Vercel.
 */
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** Pede ao servidor uma posição nova do Lichess, até 50 pontos do rating do jogador. */
export async function fetchLivePuzzle(rating: number, avoid: string[], initial = false): Promise<Puzzle> {
  const res = await fetch(`${API_URL}/api/nova-posicao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, avoid, initial }),
  });
  if (!res.ok) throw new Error((await res.text()) || "Falha ao buscar posição.");
  const data = (await res.json()) as Puzzle;
  const found = Number(data.rating);
  return { ...data, id: Date.now(), rating: found > 0 ? found : rating };
}
