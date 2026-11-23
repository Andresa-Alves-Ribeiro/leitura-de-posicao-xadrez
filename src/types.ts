export type Color = "w" | "b";

/** Peça no formato cor + tipo, ex.: "wK", "bN". */
export type Piece = `${Color}${"P" | "N" | "B" | "R" | "Q" | "K"}`;

/** 64 casas, índice 0 = a1, 7 = h1, 63 = h8. */
export type BoardArray = (Piece | null)[];

/** Análise de um dos lados (com a vez real ou com a vez trocada). */
export interface SideAnalysis {
  fen: string;
  best: string; // lance em UCI, ex.: "b1c1"
  bestSan: string; // ex.: "Rbc1"
  theme: string; // ex.: "Coluna semiaberta"
  why: string; // explicação curta do tema
  pv: string; // linha principal em SAN
  loss: Record<string, number>; // perda em centipeões de cada lance legal (UCI)
  san: Record<string, string>; // UCI -> SAN de cada lance legal
  nGood: number;
  goodSan: string[];
}

export interface Puzzle {
  id: number;
  fen: string;
  eval: number; // centipeões, ponto de vista das brancas, com a vez real
  evalOther: number;
  better: Color;
  toMove: Color;
  material: number;
  rating: number;
  stm: SideAnalysis; // lado que tem a vez
  other: SideAnalysis; // outro lado, com a vez trocada
}

export type Step = "better" | "better_fb" | "m1" | "m1_fb" | "m2" | "m2_fb" | "result";

export interface Attempt {
  puzzleId: number;
  step: Step;
  better: Color | null;
  m1: string | null;
  m2: string | null;
  xpGain: number;
  delta: number;
}

export interface Progress {
  rating: number;
  /** Piso do placar. Sobe quando não existe posição na faixa pedida. */
  floor: number;
  xp: number;
  streak: number;
  bestStreak: number;
  done: Record<number, number>; // id -> % de acerto
  /** Posições já mostradas que saíram da mesa sem voltar, mesmo sem nota. */
  seen: number[];
  /** Tabuleiros já buscados no Lichess (só a posição das peças), para não repetir. */
  boards: string[];
  /** Posição ao vivo que está na mesa, se houver. */
  currentId: number | null;
  /** Posições concluídas, sem teto — repetições também contam. */
  solved: number;
  last: number | null;
  lastDelta: number;
}

export interface Arrow {
  uci: string;
  color: string;
}
