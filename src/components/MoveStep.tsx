import type { Color } from "../types";
import { colorName } from "../lib/scoring";
import { StepBar } from "./StatsBar";

interface MoveStepProps {
  isFirst: boolean; // true = lado com a vez real; false = vez trocada
  side: Color;
  pendingSan: string | null;
  onUndo: () => void;
  onConfirm: () => void;
}

export function MoveStep({ isFirst, side, pendingSan, onUndo, onConfirm }: MoveStepProps) {
  const name = colorName(side, true);
  return (
    <>
      <StepBar current={isFirst ? 1 : 2} />
      <h2 className="q">
        {isFirst ? `É a vez das ${name}. Qual o melhor lance?` : `E se fosse a vez das ${name}?`}
        <small>
          {isFirst
            ? "Nada de tática: procure um plano. Expulsar uma peça, abrir uma coluna, rocar, levar uma peça para uma casa melhor."
            : `Mesma posição, mas agora com a vez trocada. Qual lance calmo as ${name} jogariam?`}
        </small>
      </h2>
      <div className="pending">
        {pendingSan ? (
          <>
            <span className="mv">{pendingSan}</span>
            <span className="row">
              <button className="btn sec" type="button" onClick={onUndo}>
                Desfazer
              </button>
              <button className="btn" type="button" onClick={onConfirm}>
                Confirmar
              </button>
            </span>
          </>
        ) : (
          <span className="hint">Toque numa peça das {name} e depois na casa de destino.</span>
        )}
      </div>
    </>
  );
}
