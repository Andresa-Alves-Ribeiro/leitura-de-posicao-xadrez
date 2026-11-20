# Leitura de Posição

Puzzles de xadrez **posicionais** (sem tática). Em cada posição você responde:

1. Quem está melhor: brancas ou pretas?
2. Qual o melhor lance para o lado que tem a vez?
3. E se a vez fosse do outro lado?

A nota de cada lance é a perda em relação ao melhor lance do Stockfish:
`!` até 0,15 · `!?` até 0,45 · `?!` até 1,0 · `?` acima disso.
Tem rating (Elo), sequência, XP e nível, salvos no `localStorage`.

## Rodar

Precisa de Node 18+.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173).

Outros comandos: `npm run build` (gera `dist/`), `npm run preview`, `npm run typecheck`.

## Estrutura

```
src/
  App.tsx                 fluxo: quem está melhor → lance 1 → lance 2 → resultado
  types.ts                Puzzle, SideAnalysis, Attempt, Progress
  components/
    Board.tsx             tabuleiro clicável + setas (sem biblioteca)
    BetterStep.tsx        pergunta "quem está melhor?"
    MoveStep.tsx          escolha/confirmação do lance
    ResultPanel.tsx       avaliação, notas, melhores lances, linha principal
    StatsBar.tsx          rating, sequência, nível, barra de XP
  lib/
    chess.ts              FEN → array, aplicar lance UCI (roque, en passant, promoção)
    scoring.ts            nota dos lances, Elo, XP, escolha do próximo problema
    storage.ts            progresso no localStorage
    pieces.ts             imagens das peças
  data/puzzles.json       as posições (geradas pelos scripts abaixo)
scripts/                  pipeline em Python que gera as posições
```

O app não roda engine no navegador: cada posição já vem com a perda (em centipeões)
de **todos** os lances legais dos dois lados, então a nota é instantânea.

## Gerar mais posições

Precisa de Python 3 e do [Stockfish](https://stockfishchess.org/download/).
As candidatas vêm de partidas reais do dump mensal do [Lichess](https://database.lichess.org/)
(streaming — não baixa o arquivo inteiro).

```bash
cd scripts
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# se o stockfish não estiver no PATH, aponte para o executável:
#   Windows (PowerShell): $env:STOCKFISH_PATH="C:\caminho\stockfish.exe"
#   macOS/Linux:          export STOCKFISH_PATH=/caminho/stockfish

python baixar_lichess.py --partidas 300 --saida lichess.json
# opcional: outra semente / outro mês para mais variedade
# python baixar_lichess.py --partidas 300 --semente 2 --saida lichess2.json

python filtrar.py lichess.json             # -> filtradas.json (demora bastante)
python selecionar.py filtradas.json 30     # -> ../src/data/puzzles.json
```

O `baixar_lichess.py` aceita `--mes AAAA-MM`, `--elo-min`, `--semente` e `--saida`.
Por padrão pega partidas rated com Elo ≥ 2000, cadência blitz ou mais lenta,
término normal e pelo menos 40 meios-lances; amostra FENs do meio-jogo
(ply 26–56) com a mesma probabilidade do pipeline antigo.

O que o filtro exige:
- material parelho (no máximo 1 peão de diferença);
- vantagem clara mas não decisiva (entre +0,90 e +3,20);
- melhor lance calmo para **os dois lados**: sem captura, sem xeque, sem
  capturas nos 4 primeiros lances da linha principal e sem "lance único"
  (diferença para o 2º lance menor que 1,5);
- a mesma pessoa continua melhor quando se troca a vez.

O tema (Roque, Expulsão de cavalo, Coluna semiaberta, Posto avançado, Ruptura de
peões etc.) é dado por heurísticas em `filtrar.py`, na função `theme()`.

## Créditos

Peças "cburnett" por Colin M.L. Burnett (GPLv2+), as mesmas usadas pelo Lichess.
Posições: partidas públicas do Lichess ([database.lichess.org](https://database.lichess.org/), CC0).
Análise: Stockfish (GPLv3).
