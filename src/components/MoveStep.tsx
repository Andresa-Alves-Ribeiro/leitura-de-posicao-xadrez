import type { Color } from "../types";
import { colorName } from "../lib/scoring";
import { StepBar } from "./StatsBar";

interface MoveStepProps {
  isFirst: boolean;
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
        {isFirst ? `Vez das ${name}. Qual o melhor lance?` : `E se fosse a vez das ${name}?`}
        <small>
          {isFirst
            ? "Sem tática de um lance: procure um plano calmo — espaço, coluna, posto, rei."
            : `Mesma posição, vez trocada. Qual plano calmo as ${name} escolheriam?`}
        </small>
      </h2>
      <div className={`pending${pendingSan ? " ready" : ""}`}>
        {pendingSan ? (
          <>
            <div className="pending-pick">
              <span className="pill-label">Seu lance</span>
              <span className="mv mono">{pendingSan}</span>
            </div>
            <span className="row sticky-actions">
              <button className="btn sec" type="button" onClick={onUndo}>
                Desfazer
              </button>
              <button className="btn pulse" type="button" onClick={onConfirm}>
                Confirmar
              </button>
            </span>
          </>
        ) : (
          <span className="hint">
            Toque numa peça das <b>{name}</b> e depois na casa de destino.
          </span>
        )}
      </div>
      {pendingSan && (
        <p className="move-tip why">
          Confira no tabuleiro — <kbd>Enter</kbd> confirma · <kbd>Esc</kbd> desfaz
        </p>
      )}
    </>
  );
}
