// main.js
import { newGame, aiMove, applyMove, fetchPossibleMoves } from "./api.js";
import { initGameLogic } from "./gameLogic.js";
import { initThreeScene } from "./threescene.js";
import { pieceGeomCallback, boardState } from "./gameLogic.js"; 
// ↑ gameLogic.js 側で export let boardState, export function pieceGeomCallback() などしている想定

document.addEventListener("DOMContentLoaded", () => {
  // 1) ゲームロジックの初期化
  initGameLogic();

  // 2) ボタンイベント
  document.getElementById("new-game-btn").addEventListener("click", async () => {
    const data = await newGame();
    if (data.game_id) {
      // set gameId, boardState, etc.
      console.log("New game started, ID:", data.game_id);
    }
  });

  document.getElementById("ai-move-btn").addEventListener("click", async () => {
    // ...
    console.log("AI move clicked");
  });

  // 3) three.js シーン
  const container = document.getElementById("container");
  initThreeScene(container, {
    dimension: 5,
    spacing: 100,
    boxSize: 50,
    boardState: boardState,
    pieceGeomCallback: pieceGeomCallback
  });

  document.querySelector("#container > div").style.display = 'none';
});
