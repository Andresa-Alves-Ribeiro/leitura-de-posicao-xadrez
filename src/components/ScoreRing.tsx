/** Anel de pontuação 0–100% para o resumo da posição. */
export function ScoreRing({ pct, label }: { pct: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  const tone = clamped >= 85 ? "best" : clamped >= 60 ? "good" : "warn";

  return (
    <div className={`score-ring ${tone}`} aria-label={`Pontuação ${clamped}%`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="track" cx="50" cy="50" r={r} />
        <circle
          className="fill"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring-core">
        <b className="mono">{clamped}%</b>
        <span>{label}</span>
      </div>
    </div>
  );
}
