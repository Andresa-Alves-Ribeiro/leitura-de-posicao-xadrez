import { describe, expect, it } from "vitest";
import { PUZZLES } from "../data/puzzles";
import type { Puzzle, SideAnalysis } from "../types";
import { explainMiss } from "./explainMiss";
import { buildMoveRank, evalAfterMove, evalBeforeForFeedback, sideFromFen } from "./rank";
import { grade } from "./scoring";

function movesOf(analysis: SideAnalysis, evalBefore: number) {
  const side = sideFromFen(analysis.fen);
  return Object.entries(analysis.loss).map(([uci, loss]) => ({
    uci,
    loss,
    after: evalAfterMove(evalBefore, loss, side),
    side,
  }));
}

function expectScale(p: Puzzle, which: "stm" | "other", analysis: SideAnalysis) {
  const evalBefore = evalBeforeForFeedback(p, which);
  expect(evalBefore).toBe(which === "stm" ? p.eval : p.evalOther);

  const best = buildMoveRank(analysis, analysis.best, evalBefore);
  expect(best.evalAfter).toBe(evalBefore);
  if (evalBefore !== 0) expect(best.evalAfter).not.toBe(0);

  const moves = movesOf(analysis, evalBefore);
  expect(moves.some((m) => m.uci === analysis.best && m.loss === 0)).toBe(true);

  for (const m of moves) {
    const shown = buildMoveRank(analysis, m.uci, evalBefore);
    expect(shown.evalAfter).toBe(m.after);
    const chip = shown.groups.flatMap((g) => g.moves).find((x) => x.uci === m.uci);
    if (chip) expect(chip.evalAfter).toBe(m.after);
    if (m.loss === 0) expect(m.after).toBe(evalBefore);
    else if (m.side === "w") expect(m.after).toBeLessThan(evalBefore);
    else expect(m.after).toBeGreaterThan(evalBefore);
  }
}

describe("escala da barrinha", () => {
  it("cobre as 30 posições dos dois lados", () => {
    expect(PUZZLES).toHaveLength(30);
    for (const p of PUZZLES) {
      if (p.better === "w") expect(p.eval).toBeGreaterThan(0);
      else expect(p.eval).toBeLessThan(0);

      expectScale(p, "stm", p.stm);
      expectScale(p, "other", p.other);
    }
  });

  it("o melhor lance das pretas mostra a nota da posição, não 0,00", () => {
    const p = PUZZLES.find((x) => x.id === 1);
    expect(p).toBeDefined();
    if (!p) return;
    expect(p.toMove).toBe("b");
    expect(p.eval).toBe(263);

    const best = buildMoveRank(p.stm, "f8e7", p.eval);
    expect(best.evalAfter).toBe(263);
    expect(best.groups.flatMap((g) => g.moves).find((m) => m.uci === "f8e7")?.evalAfter).toBe(263);

    const worse = buildMoveRank(p.stm, "a8a6", p.eval);
    expect(worse.evalAfter).toBe(550);
    expect(worse.groups.flatMap((g) => g.moves).find((m) => m.uci === "a8a6")?.evalAfter).toBe(550);
  });

  it("explica a imprecisão na mesma escala", () => {
    const black = PUZZLES.find((x) => x.id === 1);
    const white = PUZZLES.find((x) => x.id === 4);
    expect(black && white).toBeTruthy();
    if (!black || !white) return;

    const up = explainMiss(black.stm, "a8b8", black.eval);
    expect(up?.lines[0]).toContain("a avaliação sobe de +2,63 para +3,34");

    const down = explainMiss(white.stm, "b2b3", white.eval);
    expect(down?.lines[0]).toContain("a avaliação cai de +2,03 para +1,48");
  });
});

describe("classificação", () => {
  it("chama de Ótimo a faixa que era Excelente", () => {
    expect(grade(0).label).toBe("Melhor");
    for (let cp = 1; cp <= 20; cp++) expect(grade(cp).label).toBe("Ótimo");
    expect(grade(21).label).toBe("Bom");
    for (let cp = 0; cp <= 400; cp++) expect(grade(cp).label).not.toBe("Excelente");

    const sample = PUZZLES.find((p) => Object.values(p.stm.loss).some((l) => l > 0 && l <= 20));
    expect(sample).toBeDefined();
    if (!sample) return;
    const rank = buildMoveRank(sample.stm, null, sample.eval);
    expect(rank.groups.find((g) => g.cls === "excellent")?.label).toBe("Ótimo");
  });
});
