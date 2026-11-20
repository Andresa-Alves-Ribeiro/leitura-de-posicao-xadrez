"""Uso: python filtrar.py cands1.json [cands2.json ...]  -> gera filtradas.json

Filtra candidatas: vantagem clara, material parelho, melhor lance calmo
(sem captura/xeque e sem capturas no início da linha) para os DOIS lados.
Depois avalia todos os lances legais dos dois lados para dar nota."""
import os, chess, chess.engine, json, sys

SF = os.environ.get("STOCKFISH_PATH", "stockfish")
VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
NAMES = {chess.KNIGHT: "cavalo", chess.BISHOP: "bispo", chess.ROOK: "torre", chess.QUEEN: "dama"}


def material(b):
    s = 0
    for p, v in VAL.items():
        s += v * (len(b.pieces(p, chess.WHITE)) - len(b.pieces(p, chess.BLACK)))
    return s


def cp_white(info, b):
    return info["score"].white().score(mate_score=10000)


def quiet_line(b, pv, plies=4):
    bb = b.copy()
    for i, m in enumerate(pv[:plies]):
        if bb.is_capture(m) or m.promotion:
            return False
        if i == 0 and bb.gives_check(m):
            return False
        bb.push(m)
    return True


def flipped(b):
    f = b.copy(stack=False)
    f.turn = not f.turn
    f.ep_square = None
    return f if f.is_valid() and not f.is_check() else None


def file_status(b, f, color):
    own = any(chess.square_file(s) == f for s in b.pieces(chess.PAWN, color))
    opp = any(chess.square_file(s) == f for s in b.pieces(chess.PAWN, not color))
    if not own and not opp:
        return "aberta"
    if not own:
        return "semiaberta"
    return None


def theme(b, m):
    """Rótulo heurístico do tipo de lance (em português)."""
    color = b.turn
    piece = b.piece_at(m.from_square)
    if b.is_castling(m):
        return "Roque", "Leva o rei para a segurança e conecta as torres."
    after = b.copy(); after.push(m)
    if piece.piece_type == chess.PAWN:
        attacked = [s for s in after.attacks(m.to_square)
                    if after.piece_at(s) and after.piece_at(s).color != color
                    and after.piece_at(s).piece_type in (chess.KNIGHT, chess.BISHOP)]
        if attacked:
            t = after.piece_at(attacked[0]).piece_type
            return f"Expulsão de {NAMES[t]}", f"O peão ataca o {NAMES[t]} adversário e o obriga a sair de uma boa casa."
        contact = [s for s in after.attacks(m.to_square)
                   if after.piece_at(s) and after.piece_at(s).color != color
                   and after.piece_at(s).piece_type == chess.PAWN]
        if contact:
            return "Ruptura de peões", "Um avanço de peão que desafia a cadeia adversária e abre linhas."
        # abriu diagonal para o próprio bispo?
        def bmob(bd):
            return sum(len(bd.attacks(s)) for s in bd.pieces(chess.BISHOP, color))
        if bmob(after) - bmob(b) >= 2:
            return "Abertura de diagonal", "O peão sai da frente e libera a diagonal do bispo."
        def rqmob(bd):
            return sum(len(bd.attacks(s)) for s in bd.pieces(chess.ROOK, color) | bd.pieces(chess.QUEEN, color))
        if rqmob(after) - rqmob(b) >= 2:
            return "Abertura de linha", "O avanço de peão abre uma coluna ou fileira para as peças pesadas."
        return "Avanço de peão", "Ganha espaço e restringe as peças adversárias."
    if piece.piece_type in (chess.ROOK, chess.QUEEN):
        st = file_status(b, chess.square_file(m.to_square), color)
        if st and chess.square_file(m.to_square) != chess.square_file(m.from_square):
            return f"Coluna {st}", f"A peça pesada ocupa a coluna {st}, onde tem atividade."
    if piece.piece_type in (chess.KNIGHT, chess.BISHOP):
        to = m.to_square
        rank = chess.square_rank(to) if color == chess.WHITE else 7 - chess.square_rank(to)
        enemy_pawn_can_hit = False
        f = chess.square_file(to)
        for s in b.pieces(chess.PAWN, not color):
            sf, sr = chess.square_file(s), chess.square_rank(s)
            tr = chess.square_rank(to)
            ahead = sr > tr if color == chess.WHITE else sr < tr
            if abs(sf - f) == 1 and ahead:
                enemy_pawn_can_hit = True
        supported = any(after.piece_at(s) and after.piece_at(s).piece_type == chess.PAWN
                        and after.piece_at(s).color == color for s in after.attackers(color, to))
        if rank >= 3 and not enemy_pawn_can_hit and supported:
            return "Posto avançado", f"O {NAMES[piece.piece_type]} se instala numa casa que nenhum peão inimigo consegue atacar."
    if piece.piece_type == chess.KING and len(b.piece_map()) <= 14:
        return "Ativação do rei", "No final, o rei vira peça de ataque e se aproxima do centro."
    # melhoria geral: mobilidade
    before = len(b.attacks(m.from_square)); aft = len(after.attacks(m.to_square))
    if piece.piece_type == chess.KING:
        return "Segurança do rei", "Um lance profilático que tira o rei de linhas perigosas."
    if aft - before >= 3:
        return "Ativação de peça", f"A peça vai para uma casa onde controla muito mais."
    return "Profilaxia / melhoria", "Um lance calmo que melhora a posição e evita contrajogo."


def all_moves(eng, b, depth):
    n = b.legal_moves.count()
    infos = eng.analyse(b, chess.engine.Limit(depth=depth), multipv=n)
    res = {}
    for i in infos:
        if "pv" not in i:
            continue
        res[i["pv"][0].uci()] = i["score"].relative.score(mate_score=10000)
    best = max(res.values())
    best_info = infos[0]
    return res, best, best_info


def side_block(eng, b):
    scores, best, info = all_moves(eng, b, 13)
    bm = info["pv"][0]
    th, why = theme(b, bm)
    pv_san = b.variation_san(info["pv"][:6])
    losses = {u: max(0, best - s) for u, s in scores.items()}
    good = [u for u, l in losses.items() if l <= 40]
    return {
        "best": bm.uci(), "bestSan": b.san(bm), "theme": th, "why": why,
        "pv": pv_san, "loss": losses, "nGood": len(good),
        "goodSan": [b.san(chess.Move.from_uci(u)) for u in sorted(good, key=lambda u: losses[u])][:4],
    }


def main():
    fens = []
    for fn in sys.argv[1:]:
        fens += json.load(open(fn))
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 2, "Hash": 128})
    out, seen = [], set()
    for k, fen in enumerate(fens):
        key = fen.split(" ")[0]
        if key in seen:
            continue
        seen.add(key)
        b = chess.Board(fen)
        if b.is_check() or b.is_game_over() or abs(material(b)) > 1 or len(b.piece_map()) < 12:
            continue
        info = eng.analyse(b, chess.engine.Limit(depth=16), multipv=2)
        ev = cp_white(info[0], b)
        if not (90 <= abs(ev) <= 320):
            continue
        pv = info[0]["pv"]
        if not quiet_line(b, pv):
            continue
        gap = info[0]["score"].relative.score(mate_score=10000) - info[1]["score"].relative.score(mate_score=10000)
        if gap > 150:  # lance único costuma ser tático
            continue
        f = flipped(b)
        if f is None:
            continue
        finfo = eng.analyse(f, chess.engine.Limit(depth=16), multipv=2)
        fev = cp_white(finfo[0], f)
        if (fev > 0) != (ev > 0) or abs(fev) < 50:
            continue
        if not quiet_line(f, finfo[0]["pv"]):
            continue
        fgap = finfo[0]["score"].relative.score(mate_score=10000) - finfo[1]["score"].relative.score(mate_score=10000)
        if fgap > 150:
            continue
        stm = side_block(eng, b)
        oth = side_block(eng, f)
        out.append({
            "fen": fen, "fenOther": f.fen(), "eval": ev, "evalOther": fev,
            "better": "w" if ev > 0 else "b", "toMove": "w" if b.turn else "b",
            "material": material(b), "stm": stm, "other": oth,
        })
        print(k, len(out), ev, stm["bestSan"], stm["theme"], "|", oth["bestSan"], oth["theme"], flush=True)
    eng.quit()
    json.dump(out, open("filtradas.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("total", len(out))


main()
