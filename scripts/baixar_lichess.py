"""Uso: python baixar_lichess.py [--mes 2026-10] [--partidas 300] [--elo-min 2000]
                                   [--semente 1] [--saida lichess.json]

Extrai FENs de partidas reais do dump mensal do Lichess (database.lichess.org),
em streaming — não baixa o arquivo inteiro. A saída é uma lista JSON de FENs,
compatível com filtrar.py.
"""
from __future__ import annotations

import argparse
import io
import json
import random
import re
import sys
import urllib.request

import chess
import chess.pgn
import zstandard as zstd

TAG_RE = re.compile(r'^\[(\w+)\s+"(.*)"\]\s*$')
TIME_CONTROL_RE = re.compile(r"^(\d+)(?:\+(\d+))?$")
RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mes", default="2026-10", help="AAAA-MM do dump mensal")
    p.add_argument("--partidas", type=int, default=300, help="quantas partidas aceitar")
    p.add_argument("--elo-min", type=int, default=2000, help="Elo mínimo dos dois lados")
    p.add_argument("--semente", type=int, default=1)
    p.add_argument("--saida", default="lichess.json")
    return p.parse_args()


def dump_url(mes: str) -> str:
    return (
        "https://database.lichess.org/standard/"
        f"lichess_db_standard_rated_{mes}.pgn.zst"
    )


def parse_time_control(tc: str) -> tuple[int, int] | None:
    if not tc or tc == "-":
        return None
    m = TIME_CONTROL_RE.match(tc)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2) or 0)


def is_blitz_or_slower(tc: str) -> bool:
    """Cadência blitz ou mais lenta: base + 40*inc >= 180s (sem bullet)."""
    parsed = parse_time_control(tc)
    if parsed is None:
        return False
    base, inc = parsed
    return base + 40 * inc >= 180


def headers_ok(tags: dict[str, str], elo_min: int) -> bool:
    try:
        we = int(tags.get("WhiteElo", "0"))
        be = int(tags.get("BlackElo", "0"))
    except ValueError:
        return False
    if we < elo_min or be < elo_min:
        return False
    if tags.get("Termination") != "Normal":
        return False
    if "FEN" in tags:
        return False
    if not is_blitz_or_slower(tags.get("TimeControl", "")):
        return False
    return True


def sample_fens(game: chess.pgn.Game) -> list[str]:
    """Amostragem do meio-jogo: ply >= 26 até 56, p=0.18, sem xeque."""
    board = game.board()
    out: list[str] = []
    for move in game.mainline_moves():
        board.push(move)
        ply = board.ply()
        if ply > 56:
            break
        if ply >= 26 and random.random() < 0.18 and not board.is_check():
            out.append(board.fen())
    if not board.is_game_over() and not board.is_check() and board.ply() >= 26:
        fen = board.fen()
        if not out or out[-1] != fen:
            out.append(fen)
    return out


def count_sans(moves_blob: str) -> int:
    cleaned = re.sub(r"\{[^}]*\}", " ", moves_blob)
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    return sum(
        1
        for t in cleaned.split()
        if t not in RESULT_TOKENS and not t.endswith(".")
    )


def iter_pgn_games(stream: io.TextIOBase):
    """Gera (tags, moves_text) para cada partida do dump, sem carregar tudo."""
    pending: str | None = None

    def read_line():
        nonlocal pending
        if pending is not None:
            line, pending = pending, None
            return line
        return stream.readline()

    while True:
        tags: dict[str, str] = {}
        # cabeçalhos
        while True:
            line = read_line()
            if line == "":
                if tags:
                    yield tags, ""
                return
            stripped = line.rstrip("\n")
            if not stripped:
                if tags:
                    break
                continue
            m = TAG_RE.match(stripped)
            if m:
                tags[m.group(1)] = m.group(2)
                continue
            # lances sem linha em branco (raro)
            pending = line
            break

        if not tags:
            continue

        # corpo dos lances até linha em branco ou próximo [Event
        move_parts: list[str] = []
        while True:
            line = read_line()
            if line == "":
                break
            stripped = line.rstrip("\n")
            if not stripped:
                break
            if stripped.startswith("[Event "):
                pending = line
                break
            move_parts.append(line if line.endswith("\n") else line + "\n")

        yield tags, "".join(move_parts)
        if line == "":
            return


def extract_candidates(stream: io.TextIOBase, n_games: int, elo_min: int) -> list[str]:
    cands: list[str] = []
    accepted = 0
    scanned = 0

    for tags, moves_blob in iter_pgn_games(stream):
        scanned += 1
        if scanned % 10000 == 0:
            print(
                f"... lidas={scanned} aceitas={accepted} candidatas={len(cands)}",
                flush=True,
            )
        if not headers_ok(tags, elo_min):
            continue
        if count_sans(moves_blob) < 40:
            continue

        header = "".join(f'[{k} "{v}"]\n' for k, v in tags.items())
        pgn_text = header + "\n" + moves_blob
        game = chess.pgn.read_game(io.StringIO(pgn_text))
        if game is None:
            continue
        fens = sample_fens(game)
        if not fens:
            continue

        cands.extend(fens)
        accepted += 1
        print(
            f"partida {accepted}/{n_games}  "
            f"{tags.get('White', '?')} ({tags.get('WhiteElo', '?')}) vs "
            f"{tags.get('Black', '?')} ({tags.get('BlackElo', '?')})  "
            f"+{len(fens)} FENs  total={len(cands)}  (lidas={scanned})",
            flush=True,
        )
        if accepted >= n_games:
            break

    print(f"partidas lidas até fechar: {scanned}", flush=True)
    return cands


def main():
    args = parse_args()
    random.seed(args.semente)
    url = dump_url(args.mes)
    print(f"abrindo {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "leitura-de-posicao/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dctx = zstd.ZstdDecompressor()
        with dctx.stream_reader(resp) as reader:
            text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
            cands = extract_candidates(text, args.partidas, args.elo_min)
    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(cands, f)
    print(f"{len(cands)} candidatas -> {args.saida}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
