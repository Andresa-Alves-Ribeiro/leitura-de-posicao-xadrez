/** Faixa de dificuldade “de mesa” a partir do rating do puzzle. */
export function difficultyOf(rating: number): { key: string; label: string; hint: string } {
  if (rating < 1400) return { key: "calm", label: "Calmo", hint: "Boa para aquecer o olhar" };
  if (rating < 1700) return { key: "sharp", label: "Exigente", hint: "Peça atenção ao plano" };
  return { key: "master", label: "Mestre", hint: "Detalhe fino decide" };
}
