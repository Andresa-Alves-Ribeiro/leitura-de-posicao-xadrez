import type { Color } from "../types";
import { StepBar } from "./StatsBar";

export function BetterStep({ onAnswer }: { onAnswer: (c: Color) => void }) {
  return (
    <>
      <StepBar current={0} />
      <h2 className="q">
        Quem está melhor?
        <small>
          Material está parelho (no máximo um peão de diferença). Olhe estrutura de peões, peças ativas,
          segurança dos reis e colunas abertas.
        </small>
      </h2>
      <div className="choices">
        <button className="choice" type="button" onClick={() => onAnswer("w")}>
          Brancas <span className="sym">±</span>
        </button>
        <button className="choice" type="button" onClick={() => onAnswer("b")}>
          Pretas <span className="sym">∓</span>
        </button>
      </div>
    </>
  );
}
