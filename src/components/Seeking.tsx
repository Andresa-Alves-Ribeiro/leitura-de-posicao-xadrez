import { useEffect, useState, type SVGProps } from "react";
import wN from "../assets/pieces/wN.svg";
import wP from "../assets/pieces/wP.svg";
import wB from "../assets/pieces/wB.svg";
import wR from "../assets/pieces/wR.svg";
import wQ from "../assets/pieces/wQ.svg";

/** Rota aberta do cavalo, com folga para a peça não encostar na borda. */
const TOUR =
  "M 52 142 C 96 142 92 72 146 76 C 198 80 186 148 240 136 C 294 124 280 68 334 78 C 386 88 372 146 404 122";

const FILE = [wP, wN, wB, wR, wQ];
const RIDE = "4.2s";

function useReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

interface SeekingProps {
  low: number;
  high: number;
}

/** Espera aberta: a linha se desenha, o cavalo percorre, a faixa aparece embaixo. */
export function Seeking({ low, high }: SeekingProps) {
  const reduce = useReducedMotion();
  const motion = {
    dur: RIDE,
    repeatCount: "indefinite",
    rotate: "0",
    path: TOUR,
    keyPoints: "0;1;1",
    keyTimes: "0;0.76;1",
    calcMode: "linear",
  } as SVGProps<SVGElement>;

  return (
    <section className="seek" role="status" aria-live="polite" aria-busy="true">
      <svg className="seek-svg" viewBox="0 0 440 188" aria-hidden="true">
        <path className="seek-ghost" d={TOUR} />
        <path className="seek-draw" d={TOUR} pathLength={1} />
        <g className="seek-rider" transform={reduce ? "translate(240 136)" : undefined}>
          {!reduce && <animateMotion {...motion} />}
          <image href={wN} width="64" height="64" x="-32" y="-54" transform="scale(-1 1)" />
        </g>
      </svg>
      <div className="seek-file" aria-hidden="true">
        {FILE.map((src) => (
          <img key={src} src={src} alt="" />
        ))}
      </div>
      <div className="seek-copy">
        <p className="seek-kicker">Lichess · ao vivo</p>
        <h2 className="seek-title">Buscando uma posição na sua faixa.</h2>
        <p className="seek-sub">
          Partidas de {low} a {high}. Se não houver, entra a mais baixa e o início acompanha.
        </p>
      </div>
    </section>
  );
}
