/**
 * Salva o estoque atual da API em server/estoque.json, para ele voltar pronto
 * sempre que o servidor ligar (inclusive depois de dormir).
 *
 *   npm run estoque -- https://SEU-SERVIDOR
 *
 * Sem argumento, usa a variável API_URL. Depois é só commitar o arquivo.
 */
import { readFileSync, writeFileSync } from "node:fs";

const base = (process.argv[2] || process.env.API_URL || "").replace(/\/+$/, "");
if (!base) {
  console.error("Informe o endereço da API: npm run estoque -- https://SEU-SERVIDOR");
  process.exit(1);
}

const file = new URL("./estoque.json", import.meta.url);
const res = await fetch(`${base}/api/estoque`);
if (!res.ok) {
  console.error(`A API respondeu ${res.status}. Ela está acordada? Abra ${base}/health e tente de novo.`);
  process.exit(1);
}
const novas = await res.json();

// Junta com o que já estava salvo, sem repetir tabuleiro.
let antigas = [];
try {
  antigas = JSON.parse(readFileSync(file, "utf8"));
} catch {
  /* primeira vez */
}
const porTabuleiro = new Map();
for (const p of [...antigas, ...novas]) porTabuleiro.set(String(p.fen).split(" ")[0], p);
const todas = [...porTabuleiro.values()].slice(-150);

writeFileSync(file, JSON.stringify(todas));
console.log(`${novas.length} posições na API; ${todas.length} salvas em server/estoque.json.`);
