import type { Progress } from "../types";
import { level, XP_PER_LEVEL } from "../lib/scoring";

export function StatsBar({ progress, total }: { progress: Progress; total: number }) {
  const d = progress.lastDelta;
  const solved = Object.keys(progress.done).length;
  const lv = level(progress.xp);
  const hot = progress.streak >= 3;
  return (
    <div className={`stats${hot ? " hot" : ""}`} role="group" aria-label="Placar">
      <div className={`stat rating ${d > 0 ? "delta-up" : d < 0 ? "delta-down" : ""}`}>
        <b>{progress.rating}</b>
        <span>Elo{d ? ` ${d > 0 ? "+" : ""}${d}` : ""}</span>
      </div>
      <div className={`stat streak${hot ? " on-fire" : ""}`} title={hot ? "Sequência em chamas!" : "Sequência"}>
        <b>{progress.streak}</b>
        <span>{hot ? "Em chamas" : progress.bestStreak > progress.streak ? `Recorde ${progress.bestStreak}` : "Seq."}</span>
      </div>
      <div className="stat level" title={`Nível ${lv}`}>
        <b>Nv.{lv}</b>
        <span>XP {progress.xp % XP_PER_LEVEL}/{XP_PER_LEVEL}</span>
      </div>
      <div className="stat solved">
        <b>
          {solved}/{total}
        </b>
        <span>Resolvidas</span>
      </div>
    </div>
  );
}

export function XpBar({ xp }: { xp: number }) {
  const lv = level(xp);
  const into = xp % XP_PER_LEVEL;
  const pct = (into / XP_PER_LEVEL) * 100;
  return (
    <div className="xpwrap" title={`${into} XP até o nível ${lv + 1}`}>
      <div className="xpbar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="xp-label mono">
        Nível {lv} · {into}/{XP_PER_LEVEL} XP
      </span>
    </div>
  );
}

const STEP_LABELS = ["Leitura", "Lance 1", "Lance 2", "Resumo"];

export function StepBar({ current }: { current: number }) {
  return (
    <div className="steps" role="list" aria-label="Etapas do desafio">
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          role="listitem"
          className={`step ${i < current ? "done" : i === current ? "on" : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <i />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
