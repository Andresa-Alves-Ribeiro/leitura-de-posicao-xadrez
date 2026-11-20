import { useMemo, useState } from "react";
import type { Arrow, BoardArray } from "../types";
import { FILES, movesByFrom, sqIdx, sqName } from "../lib/chess";
import { PIECE_IMG } from "../lib/pieces";
import { ARROW_BEST } from "./ResultPanel";

interface BoardProps {
  board: BoardArray;
  flipped: boolean;
  /** Lances legais (UCI -> SAN). Se ausente, o tabuleiro fica só para leitura. */
  legal?: Record<string, string>;
  onPick?: (uci: string) => void;
  lastMove?: string | null;
  arrows?: Arrow[];
}

export function Board({ board, flipped, legal, onPick, lastMove, arrows }: BoardProps) {
  const [sel, setSel] = useState<string | null>(null);
  const byFrom = useMemo(() => (legal ? movesByFrom(legal) : {}), [legal]);
  const targets = sel && byFrom[sel] ? byFrom[sel].map((u) => u.slice(2, 4)) : [];

  function handleClick(name: string) {
    if (!legal) return;
    if (sel && byFrom[sel]) {
      const cands = byFrom[sel].filter((u) => u.slice(2, 4) === name);
      if (cands.length) {
        // promoção: escolhe dama por padrão
        const uci = cands.find((u) => u.length === 4 || u.endsWith("q")) ?? cands[0];
        setSel(null);
        onPick?.(uci);
        return;
      }
    }
    setSel(byFrom[name] ? (sel === name ? null : name) : null);
  }

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const r = flipped ? row : 7 - row;
      const f = flipped ? 7 - col : col;
      const i = r * 8 + f;
      const name = sqName(i);
      const piece = board[i];
      const cls = ["sq", (r + f) % 2 ? "l" : "d"];
      if (lastMove && (lastMove.slice(0, 2) === name || lastMove.slice(2, 4) === name)) cls.push("last");
      if (sel === name) cls.push("sel");
      if (targets.includes(name)) cls.push("tgt", "can", ...(piece ? ["occ"] : []));
      if (legal && byFrom[name]) cls.push("can");
      squares.push(
        <button
          key={name}
          type="button"
          className={cls.join(" ")}
          aria-label={name + (piece ? " " + piece : "")}
          tabIndex={legal ? 0 : -1}
          onClick={() => handleClick(name)}
        >
          {piece && <div className="pc" style={{ backgroundImage: `url("${PIECE_IMG[piece]}")` }} />}
          {col === 0 && <span className="coord r">{r + 1}</span>}
          {row === 7 && <span className="coord f">{FILES[f]}</span>}
        </button>,
      );
    }
  }

  return (
    <div className="board">
      <div className="grid">{squares}</div>
      {arrows && arrows.length > 0 && <Arrows arrows={arrows} flipped={flipped} />}
    </div>
  );
}

function Arrows({ arrows, flipped }: { arrows: Arrow[]; flipped: boolean }) {
  const pos = (s: string): [number, number] => {
    const i = sqIdx(s);
    const f = i % 8;
    const r = Math.floor(i / 8);
    return [(flipped ? 7 - f : f) + 0.5, (flipped ? r : 7 - r) + 0.5];
  };
  return (
    <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
      <defs>
        {arrows.map((a, k) => (
          <marker key={k} id={`ah${k}`} viewBox="0 0 4 4" refX="2.2" refY="2" markerWidth="2.6" markerHeight="2.6" orient="auto">
            <path d="M0,0 L4,2 L0,4 z" fill={a.color} />
          </marker>
        ))}
      </defs>
      {arrows.map((a, k) => {
        const [x1, y1] = pos(a.uci.slice(0, 2));
        const [x2, y2] = pos(a.uci.slice(2, 4));
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const sh = 0.38;
        const isBest = a.color === ARROW_BEST;
        return (
          <line
            key={k}
            x1={x1}
            y1={y1}
            x2={x2 - ((x2 - x1) / len) * sh}
            y2={y2 - ((y2 - y1) / len) * sh}
            stroke={a.color}
            strokeWidth={isBest ? 0.28 : 0.15}
            strokeLinecap="round"
            opacity={isBest ? 1 : 0.82}
            markerEnd={`url(#ah${k})`}
          />
        );
      })}
    </svg>
  );
}
