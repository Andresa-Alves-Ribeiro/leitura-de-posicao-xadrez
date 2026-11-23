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

// --- Servidor dormindo -------------------------------------------------------
// No plano grátis do SnapDeploy o container dorme após 15 min sem uso. Enquanto
// dorme, o SnapDeploy responde com a página "Waking up" dele (sem CORS), então o
// fetch falha. Aqui o site manda o sinal de acordar e espera o /health voltar.

export type ServerStatus = "ok" | "waking";

let status: ServerStatus = "ok";
const listeners = new Set<() => void>();

function setStatus(next: ServerStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((fn) => fn());
}

export function getServerStatus(): ServerStatus {
  return status;
}

export function subscribeServerStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const WAKE_TIMEOUT_MS = 180_000;
const POLL_MS = 4_000;
const RESIGNAL_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Endpoint público de "acordar" do SnapDeploy, se a API estiver hospedada lá. */
function wakeUrl(): string | null {
  if (!API_URL) return null;
  try {
    const match = new URL(API_URL).hostname.match(/^([^.]+)\.containers\.snapdeploy\.app$/);
    return match ? `https://snapdeploy.dev/api/public/wake/${match[1]}` : null;
  } catch {
    return null;
  }
}

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

let waking: Promise<boolean> | null = null;

/** Acorda o servidor e espera ele responder. Chamadas simultâneas esperam a mesma tentativa. */
function wakeServer(): Promise<boolean> {
  if (waking) return waking;
  waking = (async () => {
    setStatus("waking");
    const url = wakeUrl();
    const end = Date.now() + WAKE_TIMEOUT_MS;
    let lastSignal = 0;
    while (Date.now() < end) {
      if (url && Date.now() - lastSignal > RESIGNAL_MS) {
        lastSignal = Date.now();
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {});
      }
      if (await isUp()) return true;
      await sleep(POLL_MS);
    }
    return false;
  })().finally(() => {
    waking = null;
    setStatus("ok");
  });
  return waking;
}

function postPuzzle(body: string): Promise<Response> {
  return fetch(`${API_URL}/api/nova-posicao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/** Pede ao servidor uma posição nova do Lichess, até 50 pontos do rating do jogador. */
export async function fetchLivePuzzle(rating: number, avoid: string[], initial = false): Promise<Puzzle> {
  const body = JSON.stringify({ rating, avoid, initial });
  let res: Response;
  try {
    res = await postPuzzle(body);
  } catch {
    // A rede falhou. Se o /health também não responde, o servidor está dormindo.
    if (!API_URL || (await isUp())) {
      throw new Error("O servidor demorou demais para responder. Tente de novo.");
    }
    if (!(await wakeServer())) {
      throw new Error("O servidor não acordou a tempo. Tente de novo em instantes.");
    }
    try {
      res = await postPuzzle(body);
    } catch {
      throw new Error("O servidor demorou demais para responder. Tente de novo.");
    }
  }
  if (!res.ok) throw new Error((await res.text()) || "Falha ao buscar posição.");
  const data = (await res.json()) as Puzzle;
  const found = Number(data.rating);
  return { ...data, id: Date.now(), rating: found > 0 ? found : rating };
}
