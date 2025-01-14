// api.js
import { SERVER_URL } from "./config.js";

/**
 * 新しいゲームを開始する
 * @returns {Promise<Object>} { game_id, board, side_to_move, captured_pieces, ... } を含むオブジェクト
 */
export async function newGame() {
  try {
    const res = await fetch(`${SERVER_URL}/new_game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    return data; // { game_id, board, side_to_move, captured_pieces, ... }
  } catch (err) {
    console.error(err);
    throw new Error("Failed to start new game.");
  }
}

/**
 * AIに手を指させる
 * @param {string} gameId - ゲームID
 * @returns {Promise<Object>} { board, side_to_move, captured_pieces, ... } を含むオブジェクト
 */
export async function aiMove(gameId) {
  if (!gameId) throw new Error("No game in progress.");

  try {
    const res = await fetch(`${SERVER_URL}/get_move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId }),
    });
    const data = await res.json();
    return data; // { board, side_to_move, captured_pieces, move, error, ... }
  } catch (err) {
    console.error(err);
    throw new Error("Failed to get AI move.");
  }
}

/**
 * 指定したマスからマスへの指し手をサーバーに適用する (プロモーションあり/なし)
 * @param {string} gameId
 * @param {string} fromSq  - 移動元(例: "Ac2")
 * @param {string} toSq    - 移動先(例: "Ac3")
 * @param {string|null} promoPiece - 昇格時の駒文字 (例: "Q", "q", ...), なければ null
 * @returns {Promise<Object>} { board, side_to_move, captured_pieces, game_state, check, ... }
 */
export async function applyMove(gameId, fromSq, toSq, promoPiece = null) {
  if (!gameId) throw new Error("No game in progress.");

  const bodyData = {
    game_id: gameId,
    from: fromSq,
    to: toSq,
  };
  if (promoPiece !== null) {
    bodyData.promotion = promoPiece;
  }

  try {
    const res = await fetch(`${SERVER_URL}/apply_move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData),
    });
    const data = await res.json();
    return data; // { success, board, side_to_move, captured_pieces, game_state, check, error, ... }
  } catch (err) {
    console.error(err);
    throw new Error("Failed to apply move.");
  }
}

/**
 * あるマスの可能な移動先候補をサーバーから取得する
 * @param {string} gameId
 * @param {string} squareId - 例: "Ac2"
 * @returns {Promise<string[]>} マスID文字列の配列
 */
export async function fetchPossibleMoves(gameId, squareId) {
  if (!gameId) return [];

  try {
    const res = await fetch(`${SERVER_URL}/possible_moves`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId, square: squareId }),
    });
    const data = await res.json();
    if (data.error) {
      console.error(data.error);
      return [];
    }
    return data.possible_moves || [];
  } catch (err) {
    console.error(err);
    return [];
  }
}
