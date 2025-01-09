import uuid
import random
from flask import Flask, request, jsonify

app = Flask(__name__)


@app.after_request
def after_request(response):
    # 必要なヘッダーを追加
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers',
                         'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods',
                         'GET,POST,OPTIONS,DELETE')
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

LEVELS = ['A', 'B', 'C', 'D', 'E']
ROWS = ['1', '2', '3', '4', '5']
COLS = ['a', 'b', 'c', 'd', 'e']


def create_empty_board():
    """5x5x5 をすべて "." (空) にする。"""
    board = {}
    for lvl in LEVELS:
        for row in ROWS:
            for col in COLS:
                key = lvl + col + row  # 例: "Aa1"
                board[key] = '.'
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
    """ 'R' (白) or 'r' (黒) -> 'white' or 'black' """
    if piece == '.':
        return 'none'
    return 'white' if piece.isupper() else 'black'


def generate_all_moves(board, side_to_move):
    """指定した手番の全ての(雑な)可能手を生成して返す。"""
    moves = []
    for lvl in LEVELS:
        for row in ROWS:
            for col in COLS:
                from_square = lvl + col + row
                piece = board[from_square]
                if piece == '.' or get_piece_color(piece) != side_to_move:
                    continue

                # ---- 実際には駒の種類ごとに異なる動きを計算すべき ----
                # ここでは「上下左右前後の1マス、斜め1マス」など
                # 適当に 3D っぽい移動先を列挙する「なんちゃって」実装です
                candidate_squares = get_candidate_squares_around(
                    board, from_square)

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
        (-1,  0,  0), (1,  0,  0),  # 上下 (Level A->B->C->D->E)
        (0, -1,  0), (0,  1,  0),  # 左右
        (0,  0, -1), (0,  0,  1),  # 前後
        # 斜め方向(各軸 +/-1 組み合わせ)
        (-1, -1,  0), (-1, 1,  0), (1, -1,  0), (1, 1,  0),
        (-1,  0, -1), (-1,  0, 1), (1,  0, -1), (1,  0, 1),
        (0, -1, -1), (0, -1, 1), (0, 1, -1), (0, 1, 1),
        # 3D 斜め (レベルも含む)
        (-1, -1, -1), (-1, -1, 1), (-1, 1, -1), (-1, 1, 1),
        (1, -1, -1), (1, -1, 1), (1, 1, -1), (1, 1, 1),
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
    if piece_at_to == '.':
        return True
    # 相手の駒なら取れる
    return (get_piece_color(piece_at_to) != side_to_move)


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
    """新しいゲームを開始し、game_id を返す"""
    game_id = str(uuid.uuid4())
    board = init_board_raumschach()
    games[game_id] = {
        "board": board,
        "side_to_move": "white"
    }
    return jsonify({
        "game_id": game_id,
        "board": games[game_id]["board"],
        "side_to_move": "white"
    })


@app.route("/get_move", methods=["POST"])
def get_move():
    """
    AI による手を返すエンドポイント。
    body: { "game_id": "<uuid>" }
    """
    data = request.json
    game_id = data.get("game_id")
    if not game_id or game_id not in games:
        return jsonify({"error": "Invalid game_id"}), 400

    board = games[game_id]["board"]
    side_to_move = games[game_id]["side_to_move"]

    move = choose_ai_move(board, side_to_move)
    if move is None:
        # 動けない (チェックメイト or パス) として扱う
        return jsonify({"move": None})

    from_sq, to_sq = move
    # 実際に board を更新する (移動・駒の取りなど)
    board[to_sq] = board[from_sq]
    board[from_sq] = '.'

    # 手番を交代
    next_side = "black" if side_to_move == "white" else "white"
    games[game_id]["side_to_move"] = next_side

    return jsonify({
        "move": {
            "from": from_sq,
            "to": to_sq,
            "piece": board[to_sq]  # 移動した駒
        },
        "board": board,
        "side_to_move": next_side
    })


@app.route("/apply_move", methods=["POST"])
def apply_move():
    """
    フロントエンドから人間が指した手を受け取って適用するエンドポイント。
    body: {
      "game_id": "<uuid>",
      "from": "Aa2",
      "to": "Aa3"
    }
    """
    data = request.json
    game_id = data.get("game_id")
    from_sq = data.get("from")
    to_sq = data.get("to")

    if not game_id or game_id not in games:
        return jsonify({"error": "Invalid game_id"}), 400

    board = games[game_id]["board"]
    side_to_move = games[game_id]["side_to_move"]

    # 一応簡易的な合法手チェック
    all_moves = generate_all_moves(board, side_to_move)
    if (from_sq, to_sq) not in all_moves:
        return jsonify({"error": "Illegal move"}), 400

    # 移動を適用
    board[to_sq] = board[from_sq]
    board[from_sq] = '.'

    # 手番を交代
    next_side = "black" if side_to_move == "white" else "white"
    games[game_id]["side_to_move"] = next_side

    return jsonify({
        "success": True,
        "board": board,
        "side_to_move": next_side
    })


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
    piece = board.get(from_sq, '.')
    if piece == '.' or get_piece_color(piece) != side_to_move:
        return jsonify({"error": "Not your piece"}), 400

    # 現在の手番(side_to_move)が指せる全ての手を取得
    all_moves = generate_all_moves(board, side_to_move)

    # from_sq が一致する(移動元が同じ)手のみフィルタ
    possible_moves = [move[1] for move in all_moves if move[0] == from_sq]

    return jsonify({"possible_moves": possible_moves})


if __name__ == "__main__":
    # デバッグ用
    app.run(host="0.0.0.0", port=5000, debug=True)
