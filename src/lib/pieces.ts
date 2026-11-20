import type { Piece } from "../types";
import wP from "../assets/pieces/wP.svg";
import wN from "../assets/pieces/wN.svg";
import wB from "../assets/pieces/wB.svg";
import wR from "../assets/pieces/wR.svg";
import wQ from "../assets/pieces/wQ.svg";
import wK from "../assets/pieces/wK.svg";
import bP from "../assets/pieces/bP.svg";
import bN from "../assets/pieces/bN.svg";
import bB from "../assets/pieces/bB.svg";
import bR from "../assets/pieces/bR.svg";
import bQ from "../assets/pieces/bQ.svg";
import bK from "../assets/pieces/bK.svg";

/** Peças "cburnett" (as mesmas do Lichess). */
export const PIECE_IMG: Record<Piece, string> = { wP, wN, wB, wR, wQ, wK, bP, bN, bB, bR, bQ, bK };
