import uuid
import random
from flask import Flask, request, jsonify

app = Flask(__name__)


@app.after_request
def after_request(response):
    # 必要なヘッダーを追加
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE")
    return response


# -----------------------------------
# 1. データ構造・初期配置
# -----------------------------------
#
# Raumschach は 5x5x5 のキューブ状のボードです。
# 単純化のため、「レベル (A-E) x 行 (1-5) x 列 (a-e)」を
# 文字列キー "Aa1", "Ee5" のように扱うことにします。
#
# 駒の表現例:
#   "R" = 白 Rook
#   "r" = 黒 Rook
#   "N" = 白 Knight
#   "n" = 黒 Knight
#   ...
#   大文字: 白, 小文字: 黒
#   "."    : 空マス(何も置かれていない)
#
# 実際に Raumschach での正式な初期配置を再現しますが、簡単にするため
# そこまで厳密にチェックしないコード例にします。
LEVELS = ["A", "B", "C", "D", "E"]  # z=0..4
COLS = ["a", "b", "c", "d", "e"]  # x=0..4
ROWS = ["1", "2", "3", "4", "5"]  # y=0..4


def in_range(lvl_idx, col_idx, row_idx):
    """盤内かどうか判定する"""
    return (0 <= lvl_idx < 5) and (0 <= col_idx < 5) and (0 <= row_idx < 5)


def get_idx_from_square(square):
    """
    "Aa1" → (lvl_idx=0, col_idx=0, row_idx=0)
    "Ec5" → (4,          2,         4)
    """
    lvl = square[0]  # A..E
    col = square[1]  # a..e
    row = square[2]  # 1..5

    lvl_idx = LEVELS.index(lvl)
    col_idx = COLS.index(col)
    row_idx = ROWS.index(row)
    return lvl_idx, col_idx, row_idx


def get_square_from_idx(lvl_idx, col_idx, row_idx):
    """(0,0,0) → "Aa1" などに変換"""
    return LEVELS[lvl_idx] + COLS[col_idx] + ROWS[row_idx]


def get_piece_color(piece):
    """大文字=白, 小文字=黒, '.'=空"""
    if piece == ".":
        return None
    return "white" if piece.isupper() else "black"


def create_empty_board():
    """5x5x5 をすべて "." (空) にする。"""
    board = {}
    for lvl in LEVELS:
        for row in ROWS:
            for col in COLS:
                key = lvl + col + row  # 例: "Aa1"
                board[key] = "."
    return board


def init_board_raumschach():
    """
    Raumschach の初期配置を返す。
    ここでは説明文にある駒をなるべく再現した例。
    """
    board = create_empty_board()

    # White 側初期配置 (Level A, B)
    # Level A
    board["Aa1"] = "R"  # Rook
    board["Ab1"] = "N"  # Knight
    board["Ac1"] = "K"  # King
    board["Ad1"] = "N"
    board["Ae1"] = "R"
    for c in COLS:
        key = "A" + c + "2"
        board[key] = "P"  # Pawn

    # Level B
    board["Ba1"] = "B"  # Bishop
    board["Bb1"] = "U"  # Unicorn (仮)
    board["Bc1"] = "Q"  # Queen
    board["Bd1"] = "B"
    board["Be1"] = "U"
    for c in COLS:
        key = "B" + c + "2"
        board[key] = "P"

    # Black 側初期配置 (Level D, E)
    # Level E
    board["Ea5"] = "r"  # Rook
    board["Eb5"] = "n"  # Knight
    board["Ec5"] = "k"  # King
    board["Ed5"] = "n"
    board["Ee5"] = "r"
    for c in COLS:
        key = "E" + c + "4"
        board[key] = "p"  # Pawn

    # Level D
    board["Da5"] = "b"  # Bishop
    board["Db5"] = "u"  # Unicorn
    board["Dc5"] = "q"  # Queen
    board["Dd5"] = "b"
    board["De5"] = "u"
    for c in COLS:
        key = "D" + c + "4"
        board[key] = "p"

    return board


# ゲームの状態を管理する簡易的な辞書
# key: game_id (UUID)
# value: {
#   "board": 盤面 (dict),
#   "side_to_move": "white" or "black"
# }
games = {}


# -----------------------------------
# 2. 合法手(らしきもの)生成 (非常に簡易版)
# -----------------------------------
#
# Raumschach の完全な動きを実装しようとすると膨大になります。
# ここではあくまで「存在する駒の位置から、適当に数マス先へ動かせる」
# 程度の例で、AI はその中からランダムに一手を選ぶだけです。
#


def get_piece_color(piece: str) -> str:
    """'R' (白) or 'r' (黒) -> 'white' or 'black'"""
    if piece == ".":
        return "none"
    return "white" if piece.isupper() else "black"


ROOK_DIRS = [
    (1, 0, 0),
    (-1, 0, 0),  # レベル方向 (A->B->C->D->E)
    (0, 1, 0),
    (0, -1, 0),  # 横(列)
    (0, 0, 1),
    (0, 0, -1),  # 縦(行)
]

BISHOP_DIRS = [
    # x-y面 (z=一定)
    (0, 1, 1),
    (0, 1, -1),
    (0, -1, 1),
    (0, -1, -1),
    # x-z面 (y=一定)
    (1, 0, 1),
    (1, 0, -1),
    (-1, 0, 1),
    (-1, 0, -1),
    # y-z面 (x=一定)
    (1, 1, 0),
    (1, -1, 0),
    (-1, 1, 0),
    (-1, -1, 0),
]

UNICORN_DIRS = [
    (1, 1, 1),
    (1, 1, -1),
    (1, -1, 1),
    (1, -1, -1),
    (-1, 1, 1),
    (-1, 1, -1),
    (-1, -1, 1),
    (-1, -1, -1),
]
QUEEN_DIRS = ROOK_DIRS + BISHOP_DIRS + UNICORN_DIRS
KNIGHT_DELTAS = [
    # x-y平面 (z=0)
    (2, 1, 0),
    (2, -1, 0),
    (-2, 1, 0),
    (-2, -1, 0),
    (1, 2, 0),
    (1, -2, 0),
    (-1, 2, 0),
    (-1, -2, 0),
    # x-z平面 (y=0)
    (2, 0, 1),
    (2, 0, -1),
    (-2, 0, 1),
    (-2, 0, -1),
    (1, 0, 2),
    (1, 0, -2),
    (-1, 0, 2),
    (-1, 0, -2),
    # y-z平面 (x=0)
    (0, 2, 1),
    (0, 2, -1),
    (0, -2, 1),
    (0, -2, -1),
    (0, 1, 2),
    (0, 1, -2),
    (0, -1, 2),
    (0, -1, -2),
]

KING_DELTAS = [
    (0, 0, -1),
    (0, 0, 1),
    (0, -1, -1),
    (0, -1, 0),
    (0, -1, 1),
    (0, 1, -1),
    (0, 1, 0),
    (0, 1, 1),
    (1, 0, -1),
    (1, 0, 0),
    (1, 0, 1),
    (1, -1, -1),
    (1, -1, 0),
    (1, -1, 1),
    (1, 1, -1),
    (1, 1, 0),
    (1, 1, 1),
    (-1, 0, -1),
    (-1, 0, 0),
    (-1, 0, 1),
    (-1, -1, -1),
    (-1, -1, 0),
    (-1, -1, 1),
    (-1, 1, -1),
    (-1, 1, 0),
    (-1, 1, 1),
]

PAWN_PASSIVE_DELTAS = [(1, 0, 0), (0, 0, 1)]
PAWN_CAPTURE_DELTAS = [(1, -1, 0), (1, 1, 0), (0, -1, 1), (0, 1, 1)]


def slide_in_direction(board, from_square, d_lvl, d_col, d_row, side_to_move):
    """
    from_square から (d_lvl, d_col, d_row) 方向へ
    1マスずつ進み、行けるマス(相手駒ならそこまで含む)を返す。
    味方駒があった場合はその手前まで。
    """
    moves = []
    lvl_idx, col_idx, row_idx = get_idx_from_square(from_square)

    while True:
        lvl_idx += d_lvl
        col_idx += d_col
        row_idx += d_row
        if not in_range(lvl_idx, col_idx, row_idx):
            break  # 盤外に出たので終了

        square = get_square_from_idx(lvl_idx, col_idx, row_idx)
        piece_at = board[square]
        if piece_at == ".":
            # 空マス → 移動可能
            moves.append(square)
        else:
            # 駒がある
            if get_piece_color(piece_at) != side_to_move:
                # 敵駒なら 取って終了
                moves.append(square)
            # 味方駒 or 敵駒 いずれにせよこの先には進めない
            break
    return moves


def get_candidate_squares_3d(board, from_square, side_to_move, mate_check=False):
    """
    from_square にある駒の種類を判別し、
    Raumschachにおける合法手(スライド or ナイトジャンプ)を返す。
    """
    piece = board[from_square]
    if piece == ".":
        return []  # 空マス

    # 大文字・小文字を区別せず動きは同じ
    piece_type = piece.upper()  # R, B, U, Q, N など

    moves = []

    if piece_type == "R":
        # Rook
        for d in ROOK_DIRS:
            moves.extend(
                slide_in_direction(board, from_square, d[0], d[1], d[2], side_to_move)
            )

    elif piece_type == "B":
        # Bishop
        for d in BISHOP_DIRS:
            moves.extend(
                slide_in_direction(board, from_square, d[0], d[1], d[2], side_to_move)
            )

    elif piece_type == "U":
        # Unicorn
        for d in UNICORN_DIRS:
            moves.extend(
                slide_in_direction(board, from_square, d[0], d[1], d[2], side_to_move)
            )

    elif piece_type == "Q":
        # Queen = Rook + Bishop + Unicorn
        for d in QUEEN_DIRS:
            moves.extend(
                slide_in_direction(board, from_square, d[0], d[1], d[2], side_to_move)
            )

    elif piece_type == "N":
        # Knight (1stepジャンプ)
        lvl_idx, col_idx, row_idx = get_idx_from_square(from_square)
        for dL, dC, dR in KNIGHT_DELTAS:
            L2 = lvl_idx + dL
            C2 = col_idx + dC
            R2 = row_idx + dR
            if in_range(L2, C2, R2):
                sq2 = get_square_from_idx(L2, C2, R2)
                target_piece = board[sq2]
                # 味方駒がいる場合はNG
                if target_piece == ".":
                    moves.append(sq2)
                else:
                    if get_piece_color(target_piece) != side_to_move:
                        moves.append(sq2)
                # Knightはジャンプなのでそれ以上続かない

    # 他の駒 (King, Pawn など) は省略 (ここに加えてもOK)
    elif piece_type == "K":
        lvl_idx, col_idx, row_idx = get_idx_from_square(from_square)
        for dL, dC, dR in KING_DELTAS:
            L2 = lvl_idx + dL
            C2 = col_idx + dC
            R2 = row_idx + dR
            if in_range(L2, C2, R2):
                sq2 = get_square_from_idx(L2, C2, R2)
                target_piece = board[sq2]
                # 味方駒がいる場合はNG
                if target_piece == ".":
                    moves.append(sq2)
                else:
                    if get_piece_color(target_piece) != side_to_move:
                        moves.append(sq2)

    elif piece_type == "P":
        lvl_idx, col_idx, row_idx = get_idx_from_square(from_square)
        if not mate_check:
            for dL, dC, dR in PAWN_PASSIVE_DELTAS:
                if side_to_move == "white":
                    L2 = lvl_idx + dL
                    C2 = col_idx + dC
                    R2 = row_idx + dR
                else:
                    L2 = lvl_idx - dL
                    C2 = col_idx - dC
                    R2 = row_idx - dR
                if in_range(L2, C2, R2):
                    sq2 = get_square_from_idx(L2, C2, R2)
                    target_piece = board[sq2]
                    # 味方駒がいる場合はNG
                    if target_piece == ".":
                        moves.append(sq2)
        for dL, dC, dR in PAWN_CAPTURE_DELTAS:
            if side_to_move == "white":
                L2 = lvl_idx + dL
                C2 = col_idx + dC
                R2 = row_idx + dR
            else:
                L2 = lvl_idx - dL
                C2 = col_idx - dC
                R2 = row_idx - dR
            if in_range(L2, C2, R2):
                sq2 = get_square_from_idx(L2, C2, R2)
                target_piece = board[sq2]
                # 味方駒がいる場合はNG
                if (
                    get_piece_color(target_piece) != "none"
                    and get_piece_color(target_piece) != side_to_move
                ):
                    moves.append(sq2)

    return moves


def get_opponent_side(side_to_move):
    if side_to_move == "white":
        return "black"
    elif side_to_move == "black":
        return "white"
    else:
        raise ValueError(f"Invalid side_to_move: {side_to_move}")


def generate_all_moves(board, side_to_move, mate_check=False):
    """指定した手番の全ての(雑な)可能手を生成して返す。"""
    moves = []
    for lvl in LEVELS:
        for row in ROWS:
            for col in COLS:
                from_square = lvl + col + row
                piece = board[from_square]
                if piece == "." or get_piece_color(piece) != side_to_move:
                    continue

                candidate_squares = get_candidate_squares_3d(
                    board, from_square, side_to_move, mate_check
                )

                # 各移動先が空きマス or 敵駒なら move を作る
                for to_square in candidate_squares:
                    if can_move_to(board, from_square, to_square, side_to_move):
                        moves.append((from_square, to_square))

    return moves


def get_candidate_squares_around(board, square):
    """
    square の周囲数マス(上下左右前後 + 斜め)を
    適当に返すだけ。実際の Raumschach の動きとは異なります。
    """
    lvl = square[0]  # 'A' ~ 'E'
    col = square[1]  # 'a' ~ 'e'
    row = square[2]  # '1' ~ '5'

    lvl_idx = LEVELS.index(lvl)
    col_idx = COLS.index(col)
    row_idx = ROWS.index(row)

    offsets = [
        (-1, 0, 0),
        (1, 0, 0),  # 上下 (Level A->B->C->D->E)
        (0, -1, 0),
        (0, 1, 0),  # 左右
        (0, 0, -1),
        (0, 0, 1),  # 前後
        # 斜め方向(各軸 +/-1 組み合わせ)
        (-1, -1, 0),
        (-1, 1, 0),
        (1, -1, 0),
        (1, 1, 0),
        (-1, 0, -1),
        (-1, 0, 1),
        (1, 0, -1),
        (1, 0, 1),
        (0, -1, -1),
        (0, -1, 1),
        (0, 1, -1),
        (0, 1, 1),
        # 3D 斜め (レベルも含む)
        (-1, -1, -1),
        (-1, -1, 1),
        (-1, 1, -1),
        (-1, 1, 1),
        (1, -1, -1),
        (1, -1, 1),
        (1, 1, -1),
        (1, 1, 1),
    ]

    result = []
    for d_lvl, d_col, d_row in offsets:
        new_lvl_idx = lvl_idx + d_lvl
        new_col_idx = col_idx + d_col
        new_row_idx = row_idx + d_row
        if 0 <= new_lvl_idx < 5 and 0 <= new_col_idx < 5 and 0 <= new_row_idx < 5:
            new_lvl = LEVELS[new_lvl_idx]
            new_col = COLS[new_col_idx]
            new_row = ROWS[new_row_idx]
            result.append(new_lvl + new_col + new_row)
    return result


def can_move_to(board, from_square, to_square, side_to_move):
    """移動先が空きマス or 相手駒なら OK (極めて雑なルール)"""
    piece_at_to = board[to_square]
    if piece_at_to == ".":
        return True
    # 相手の駒なら取れる
    return get_piece_color(piece_at_to) != side_to_move


# -----------------------------------
# 3. AI (最弱: ランダムに動く)
# -----------------------------------
def choose_ai_move(board, side_to_move):
    """side_to_move の全合法手(らしきもの)からランダムに 1手選ぶ。なければ None"""
    moves = generate_all_moves(board, side_to_move)
    if not moves:
        return None
    return random.choice(moves)


# -----------------------------------
# 4. Flask ルーティング
# -----------------------------------
@app.route("/new_game", methods=["POST"])
def new_game():
    game_id = str(uuid.uuid4())
    board = init_board_raumschach()
    games[game_id] = {
        "board": board,
        "side_to_move": "white",
        "captured_pieces": {"white": [], "black": []},  # 白が取った駒  # 黒が取った駒
    }
    return jsonify(
        {
            "game_id": game_id,
            "board": board,
            "side_to_move": "white",
            "captured_pieces": {"white": [], "black": []},
        }
    )


@app.route("/get_move", methods=["POST"])
def get_move():
    data = request.json
    game_id = data.get("game_id")
    if not game_id or game_id not in games:
        return jsonify({"error": "Invalid game_id"}), 400

    board = games[game_id]["board"]
    side_to_move = games[game_id]["side_to_move"]
    captured_pieces = games[game_id]["captured_pieces"]

    move = choose_ai_move(board, side_to_move)
    if move is None:
        return jsonify({"move": None})

    from_sq, to_sq = move
    target_piece = board[to_sq]  # 移動先の駒(取る駒かもしれない)
    moved_piece = board[from_sq]

    # もし駒があれば、それを取る(＝捕獲リストに追加)
    if target_piece != ".":
        if side_to_move == "white":
            captured_pieces["white"].append(target_piece)  # 白が黒駒を取った
        else:
            captured_pieces["black"].append(target_piece)  # 黒が白駒を取った

    board[to_sq] = moved_piece
    board[from_sq] = "."

    # 手番交代
    next_side = "black" if side_to_move == "white" else "white"
    games[game_id]["side_to_move"] = next_side

    return jsonify(
        {
            "move": {"from": from_sq, "to": to_sq, "piece": moved_piece},
            "board": board,
            "side_to_move": next_side,
            "captured_pieces": captured_pieces,
        }
    )


@app.route("/apply_move", methods=["POST"])
def apply_move():
    data = request.json
    game_id = data.get("game_id")
    from_sq = data.get("from")
    to_sq = data.get("to")

    if not game_id or game_id not in games:
        return jsonify({"error": "Invalid game_id"}), 400

    board = games[game_id]["board"]
    side_to_move = games[game_id]["side_to_move"]
    captured_pieces = games[game_id]["captured_pieces"]

    all_moves = generate_all_moves(board, side_to_move)
    if (from_sq, to_sq) not in all_moves:
        return jsonify({"error": "Illegal move"}), 400

    target_piece = board[to_sq]  # 移動先にある駒
    moved_piece = board[from_sq]

    # もしそこに相手の駒がいたら取る
    if target_piece != ".":
        if side_to_move == "white":
            captured_pieces["white"].append(target_piece)
        else:
            captured_pieces["black"].append(target_piece)

    # 駒を動かす
    board[to_sq] = moved_piece
    board[from_sq] = "."

    # 手番交代
    next_side = "black" if side_to_move == "white" else "white"
    games[game_id]["side_to_move"] = next_side

    return jsonify(
        {
            "success": True,
            "board": board,
            "side_to_move": next_side,
            "captured_pieces": captured_pieces,
        }
    )


@app.route("/possible_moves", methods=["POST"])
def possible_moves():
    """
    指定したゲームIDと駒の位置(from_square)から、
    その駒が動けるマス一覧を返すエンドポイント。

    body: {
      "game_id": "<uuid>",
      "square": "Aa2"
    }
    """
    data = request.json
    game_id = data.get("game_id")
    from_sq = data.get("square")

    if not game_id or game_id not in games:
        return jsonify({"error": "Invalid game_id"}), 400

    board = games[game_id]["board"]
    side_to_move = games[game_id]["side_to_move"]

    # 駒の色が現在の手番(side_to_move)と一致しているか簡易チェック
    piece = board.get(from_sq, ".")
    if piece == "." or get_piece_color(piece) != side_to_move:
        return jsonify({"error": "Not your piece"}), 400

    # 現在の手番(side_to_move)が指せる全ての手を取得
    all_moves = generate_all_moves(board, side_to_move)

    # from_sq が一致する(移動元が同じ)手のみフィルタ
    possible_moves = [move[1] for move in all_moves if move[0] == from_sq]

    return jsonify({"possible_moves": possible_moves})


if __name__ == "__main__":
    # デバッグ用
    app.run(host="0.0.0.0", port=5001, debug=True)
