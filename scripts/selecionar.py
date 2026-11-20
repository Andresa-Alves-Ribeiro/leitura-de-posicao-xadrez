"""Uso: python selecionar.py filtradas.json [quantidade]

Escolhe posições variadas (prioriza temas específicos, evita posições quase
iguais), calcula um rating de dificuldade, adiciona o SAN de cada lance legal
e grava em ../src/data/puzzles.json."""
import json, sys, os, chess

SRC = sys.argv[1] if len(sys.argv) > 1 else "filtradas.json"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 16
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "puzzles.json")

GENERIC = {"Profilaxia / melhoria", "Ativação de peça", "Avanço de peão"}


def diff(a, b):
    A = chess.Board(a).piece_map(); B = chess.Board(b).piece_map()
    return sum(1 for s in range(64) if A.get(s) != B.get(s))


def prio(p):
    return (p["stm"]["theme"] not in GENERIC) * 2 + (p["other"]["theme"] not in GENERIC)


d = json.load(open(SRC, encoding="utf-8"))
d.sort(key=prio, reverse=True)
sel = []
for p in d:
    if all(diff(p["fen"], q["fen"]) >= 8 for q in sel):
        sel.append(p)
sel = sel[:N]

for p in sel:
    # menos lances bons + vantagem menor = mais difícil
    hard = 1 / (1 + p["stm"]["nGood"]) + 1 / (1 + p["other"]["nGood"])
    p["rating"] = int(round((900 + 900 * hard + (320 - abs(p["eval"])) * 2) / 25) * 25)
    for key, fk in (("stm", "fen"), ("other", "fenOther")):
        b = chess.Board(p[fk]); blk = p[key]
        blk["fen"] = p[fk]
        blk["san"] = {u: b.san(chess.Move.from_uci(u)) for u in blk["loss"]}
    p.pop("fenOther", None)

sel.sort(key=lambda p: p["rating"])
for i, p in enumerate(sel):
    p["id"] = i + 1

json.dump(sel, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(sel)} posições gravadas em {os.path.normpath(OUT)}")
