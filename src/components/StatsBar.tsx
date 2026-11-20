import type { Progress } from "../types";
import { level, XP_PER_LEVEL } from "../lib/scoring";

export function StatsBar({ progress, total }: { progress: Progress; total: number }) {
  const d = progress.lastDelta;
  const solved = Object.keys(progress.done).length;
  return (
    <>
      <div className="stats">
        <div className={`stat ${d > 0 ? "delta-up" : d < 0 ? "delta-down" : ""}`}>
          <b>{progress.rating}</b>
          <span>Rating{d ? ` ${d > 0 ? "+" : ""}${d}` : ""}</span>
        </div>
        <div className="stat">
          <b>{progress.streak}</b>
          <span>Sequência</span>
        </div>
        <div className="stat">
          <b>{level(progress.xp)}</b>
          <span>Nível</span>
        </div>
        <div className="stat">
          <b>
            {solved}/{total}
          </b>
          <span>Resolvidas</span>
        </div>
      </div>
    </>
  );
}

export function XpBar({ xp }: { xp: number }) {
  return (
    <div className="xpbar" title="XP até o próximo nível">
      <i style={{ width: `${((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%` }} />
    </div>
  );
}

export function StepBar({ current }: { current: number }) {
  return (
    <div className="steps">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < current ? "done" : i === current ? "on" : ""} />
      ))}
    </div>
  );
}
