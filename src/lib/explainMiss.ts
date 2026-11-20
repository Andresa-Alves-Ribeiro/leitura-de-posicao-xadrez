import type { BoardArray, Piece, SideAnalysis } from "../types";
import { parseFen } from "./chess";
import { fmtDelta, fmtEval, fmtLoss, grade, type GradeCls } from "./scoring";

export interface MissExplain {
  title: string;
  cls: GradeCls;
  lines: string[];
  chip: string;
}

const PIECE_PT: Record<string, string> = {
  P: "peão",
  N: "cavalo",
  B: "bispo",
  R: "torre",
  Q: "dama",
  K: "rei",
};

const BAD: GradeCls[] = ["inaccuracy", "mistake", "blunder"];

const TITLE: Record<"inaccuracy" | "mistake" | "blunder", string> = {
  inaccuracy: "Por que é impreciso",
  mistake: "Por que é um erro",
  blunder: "Por que é uma gafe",
};

const CHIP: Record<"inaccuracy" | "mistake" | "blunder", string> = {
  inaccuracy: "Desvio leve",
  mistake: "Desvio grave",
  blunder: "Colapso da avaliação",
};

function pieceAt(board: BoardArray, sq: string): Piece | null {
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  return board[r * 8 + f] ?? null;
}

function pieceName(p: Piece | null): string {
  return p ? PIECE_PT[p[1]] ?? "peça" : "peça";
}

function isTacticalSan(san: string): boolean {
  return /x|\+|\#|=/.test(san);
}

function fileOf(sq: string) {
  return sq[0];
}
function rankOf(sq: string) {
  return parseInt(sq[1], 10);
}

function countBetterThan(lossMap: Record<string, number>, myLoss: number): number {
  return Object.values(lossMap).filter((l) => l < myLoss - 0.5).length;
}

function countInBand(lossMap: Record<string, number>, maxLoss: number): number {
  return Object.values(lossMap).filter((l) => l <= maxLoss).length;
}

/**
 * Explicação técnica do lance do usuário quando for Impreciso / Erro / Gafe.
 * Compara o lance jogado com o melhor e com a posição no tabuleiro.
 */
export function explainMiss(
  a: SideAnalysis,
  mineUci: string | null,
  evalBefore: number,
): MissExplain | null {
  if (!mineUci || mineUci === a.best) return null;
  const mySan = a.san[mineUci];
  if (!mySan) return null;

  const loss = a.loss[mineUci] ?? 999;
  const g = grade(loss);
  if (!BAD.includes(g.cls)) return null;
  const cls = g.cls as "inaccuracy" | "mistake" | "blunder";

  const board = parseFen(a.fen);
  const myFrom = mineUci.slice(0, 2);
  const myTo = mineUci.slice(2, 4);
  const bestFrom = a.best.slice(0, 2);
  const bestTo = a.best.slice(2, 4);
  const myPiece = pieceAt(board, myFrom);
  const bestPiece = pieceAt(board, bestFrom);
  const captured = pieceAt(board, myTo);
  const evalAfter = evalBefore - loss;
  const lines: string[] = [];

  // 1) Severidade + números
  if (cls === "inaccuracy") {
    lines.push(
      `Com ${mySan} a avaliação cai de ${fmtEval(evalBefore)} para ${fmtEval(evalAfter)} (Δ ${fmtDelta(-loss)}). Ainda não é um desastre, mas o lance perde precisão em relação a ${a.bestSan}.`,
    );
  } else if (cls === "mistake") {
    lines.push(
      `Com ${mySan} você entrega cerca de ${fmtLoss(loss)} peões de avaliação (${fmtEval(evalBefore)} → ${fmtEval(evalAfter)}). É um erro concreto: a posição muda de caráter contra você.`,
    );
  } else {
    lines.push(
      `Gafe: ${mySan} derruba a avaliação em ${fmtLoss(loss)} peões (${fmtEval(evalBefore)} → ${fmtEval(evalAfter)}). Em termos práticos, você transforma uma posição jogável numa claramente inferior.`,
    );
  }

  // 2) Tema do melhor vs o que você fez
  const samePiece = myPiece && bestPiece && myPiece[1] === bestPiece[1];
  const sameFrom = myFrom === bestFrom;

  if (!samePiece) {
    lines.push(
      `A ideia correta era ${a.theme.toLowerCase()} com ${a.bestSan} (${pieceName(bestPiece)}). Você moveu o ${pieceName(myPiece)} (${mySan}) — peça e plano diferentes do que a posição pedia.`,
    );
  } else if (sameFrom && myTo !== bestTo) {
    lines.push(
      `Você moveu a peça certa (${pieceName(myPiece)}), mas para a casa errada: ${mySan} em vez de ${a.bestSan}. Em ${bestTo} ela cumpre o tema “${a.theme}”; em ${myTo}, não.`,
    );
  } else if (!sameFrom) {
    lines.push(
      `O plano da posição gira em torno de “${a.theme}” (${a.bestSan}). ${mySan} parte de outra casa (${myFrom}) e não resolve o mesmo problema no tabuleiro.`,
    );
  } else {
    lines.push(
      `O melhor lance (${a.bestSan}) trabalha o tema “${a.theme}”: ${a.why} O seu ${mySan} não entrega essa melhoria.`,
    );
  }

  // 3) Detalhe tático vs posicional
  const mineTac = isTacticalSan(mySan);
  const bestTac = isTacticalSan(a.bestSan);
  if (mineTac && !bestTac) {
    if (captured) {
      lines.push(
        `Capturar o ${pieceName(captured)} com ${mySan} parece ativo, mas aqui a posição pedia um lance calmo (${a.bestSan}). A captura não melhora estrutura, atividade útil nem segurança o bastante para justificar a perda de avaliação.`,
      );
    } else if (/\+|\#/.test(mySan)) {
      lines.push(
        `${mySan} dá xeque, mas é um xeque sem veneno: depois das respostas naturais a avaliação cai. ${a.bestSan} melhora a posição sem depender de um lance “barulhento”.`,
      );
    } else if (/=/.test(mySan)) {
      lines.push(
        `Promover com ${mySan} muda o material na hora, porém o Stockfish mostra que o timing/casa da promoção custa avaliação frente a ${a.bestSan}.`,
      );
    }
  } else if (!mineTac && bestTac) {
    lines.push(
      `Aqui havia uma continuidade mais concreta com ${a.bestSan}. ${mySan} é calmo demais e deixa escapar a pressão tática que a posição oferecia.`,
    );
  }

  // 4) Segurança do rei / profilaxia
  const bestIsKing = bestPiece?.[1] === "K";
  const mineIsKing = myPiece?.[1] === "K";
  if (bestIsKing && !mineIsKing) {
    lines.push(
      `O rei precisava se ajustar (${a.bestSan}). Ao jogar ${mySan}, você deixa o rei na casa ${bestFrom} — e o tema “${a.theme}” fica sem resposta.`,
    );
  } else if (mineIsKing && !bestIsKing) {
    lines.push(
      `Mover o rei com ${mySan} não era a prioridade. A melhoria estava em outra peça (${a.bestSan}), enquanto o rei já estava (ou deveria ficar) onde estava.`,
    );
  }

  // 5) Colunas / avanço geográfico
  if (/^Coluna/i.test(a.theme) && bestPiece && (bestPiece[1] === "R" || bestPiece[1] === "Q")) {
    if (fileOf(myTo) !== fileOf(bestTo)) {
      lines.push(
        `${a.bestSan} coloca a peça pesada na coluna-chave (${fileOf(bestTo)}). ${mySan} não ocupa essa coluna, então a atividade prometida pelo tema não aparece.`,
      );
    }
  }

  if (/Posto|Ativação|Avanço/i.test(a.theme) && samePiece && myPiece) {
    const myDepth = rankOf(myTo);
    const bestDepth = rankOf(bestTo);
    if (Math.abs(bestDepth - myDepth) >= 1 || fileOf(myTo) !== fileOf(bestTo)) {
      lines.push(
        `A casa ${bestTo} é o destino que ativa o ${pieceName(myPiece)} de verdade. Em ${myTo}, a peça controla menos (ou fica mais vulnerável) do que em ${bestTo}.`,
      );
    }
  }

  // 6) Contexto de alternativas melhores
  const betterCount = countBetterThan(a.loss, loss);
  const nearBest = countInBand(a.loss, 50);
  if (betterCount >= 3) {
    lines.push(
      `Havia ${betterCount} lances objetivamente melhores que ${mySan}. Só na faixa Melhor–Bom existem ${nearBest} opções — o tabuleiro oferecia margem, e ${mySan} ficou fora dela.`,
    );
  } else if (betterCount >= 1) {
    lines.push(
      `Pelo menos ${betterCount === 1 ? "um lance era" : `${betterCount} lances eram`} claramente superior${betterCount > 1 ? "es" : ""} a ${mySan}; o topo da lista é ${a.bestSan}.`,
    );
  }

  // 7) Destino ocupado / troca que não compensa
  if (captured && myPiece) {
    const bestAlsoCaptures = pieceAt(board, bestTo);
    if (!bestAlsoCaptures) {
      lines.push(
        `Trocar ou capturar o ${pieceName(captured)} com ${mySan} não era forçado: ${a.bestSan} deixa essa peça onde está e ainda assim melhora a avaliação. A captura aqui custa tempo/estrutura.`,
      );
    }
  }

  // 8) Linha principal como contraste (erro/gafe)
  if (a.pv && cls !== "inaccuracy") {
    lines.push(
      `Compare com a linha do melhor: ${a.pv}. Depois de ${mySan}, essa continuidade deixa de existir — e a avaliação reflete exatamente isso.`,
    );
  }

  const unique = [...new Set(lines)].slice(0, 4);

  return {
    title: TITLE[cls],
    cls,
    lines: unique,
    chip: CHIP[cls],
  };
}
