import { describe, expect, it } from "vitest";
import { MIN_RATING, ratingDelta } from "./scoring";

describe("ratingDelta", () => {
  it("sobe 48 com as três respostas plenas", () => {
    expect(ratingDelta(true, 1, 1)).toBe(48);
  });

  it("desce 48 quando as três falham", () => {
    expect(ratingDelta(false, 0, 0)).toBe(-48);
  });

  it("fica no meio quando um acerto pleno compensa duas gafes", () => {
    expect(ratingDelta(true, 0, 0)).toBe(-16);
    expect(ratingDelta(false, 1, 1)).toBe(16);
  });

  it("acompanha a nota parcial dos lances", () => {
    expect(ratingDelta(true, 0.75, 0.75)).toBe(32);
    expect(ratingDelta(true, 0.9, 0.9)).toBe(42);
  });

  it("não passa do piso", () => {
    expect(MIN_RATING).toBe(500);
  });
});
