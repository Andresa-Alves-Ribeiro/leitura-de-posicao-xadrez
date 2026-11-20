import type { Color } from "../types";
import { StepBar } from "./StatsBar";

export function BetterStep({ onAnswer }: { onAnswer: (c: Color) => void }) {
  return (
    <>
      <StepBar current={0} />
      <h2 className="q">
        Quem está melhor?
        <small>
          Material está parelho. Olhe estrutura, atividade das peças, espaço e segurança dos reis — quem manda no
          tabuleiro?
        </small>
      </h2>
      <div className="choices">
        <button className="choice w" type="button" onClick={() => onAnswer("w")}>
          <span className="choice-side">
            <span className="dot w" aria-hidden="true" />
            Brancas
          </span>
          <span className="choice-meta">
            <span className="sym">±</span>
            <kbd className="choice-kbd">1</kbd>
          </span>
        </button>
        <button className="choice b" type="button" onClick={() => onAnswer("b")}>
          <span className="choice-side">
            <span className="dot b" aria-hidden="true" />
            Pretas
          </span>
          <span className="choice-meta">
            <span className="sym">∓</span>
            <kbd className="choice-kbd">2</kbd>
          </span>
        </button>
      </div>
    </>
  );
}
