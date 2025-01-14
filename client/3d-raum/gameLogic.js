// gameLogic.js
import {
    newGame as apiNewGame,
    aiMove as apiAiMove,
    applyMove as apiApplyMove,
    fetchPossibleMoves as apiFetchMoves,
  } from "./api.js";

  import * as THREE from 'three';
import { reRenderThreeBoard, highlightSquare3D, unhighlightSquare3D } from "./threescene.js";
  
  /** グローバル状態（ほかのJSからも参照したいならexport） */
  export let gameId = null;
  export let boardState = {};
  export let sideToMove = "white";
  export let selectedSquare = null;
  export let possibleDestinations = [];
  export let check = false;
  export let gameState = "continue";
  
  // 駒の捕獲状況
  export let capturedPieces = {
    white: [],
    black: [],
  };
  
  // DOM要素への参照 (HTML内のgetElementByIdで取得)
  let boardContainer, gameIdSpan, sideToMoveSpan;
  let whiteCapturedSpan, blackCapturedSpan;
  let gameStateSpan;
  
  /**
   * ゲームロジック初期化。
   * こちらで、HTML内の要素を取得し、イベントリスナーをセットアップする。
   */
  export function initGameLogic() {
    boardContainer = document.getElementById("board-container");
    gameIdSpan = document.getElementById("game-id");
    sideToMoveSpan = document.getElementById("side-to-move");
  
    whiteCapturedSpan = document.getElementById("white-captured");
    blackCapturedSpan = document.getElementById("black-captured");
  
    gameStateSpan = document.getElementById("game-state");
  
    // ボタンイベントの登録（HTML側にボタンがあると想定）
    const newGameBtn = document.getElementById("new-game-btn");
    const aiMoveBtn = document.getElementById("ai-move-btn");
  
    newGameBtn.addEventListener("click", doNewGame);
    aiMoveBtn.addEventListener("click", doAiMove);
  }
  
  /** 新しいゲームを開始する（サーバーにリクエスト） */
  export async function doNewGame() {
    try {
      const data = await apiNewGame();
      if (data.game_id) {
        gameId = data.game_id;
        boardState = data.board;
        sideToMove = data.side_to_move;
        capturedPieces = data.captured_pieces ?? { white: [], black: [] };
        check = false;
        gameState = "continue";
  
        gameIdSpan.textContent = gameId;
        sideToMoveSpan.textContent = sideToMove;
        renderCapturedPieces();
        renderBoard();
        reRenderThreeBoard({dimension: 5, spacing: 100, boxSize: 50, boardState, pieceGeomCallback});
      }
    } catch (err) {
      console.error(err);
      alert("Failed to start new game.");
    }
  }
  
  /** AIに指してもらう */
  export async function doAiMove() {
    if (!gameId) {
      alert("No game in progress.");
      return;
    }
    try {
      const data = await apiAiMove(gameId);
  
      if (data.move === null) {
        alert("No move available (maybe checkmate?)");
        return;
      }
      if (data.error) {
        alert(data.error);
        return;
      }
  
      // boardState更新
      boardState = data.board;
      sideToMove = data.side_to_move;
      capturedPieces = data.captured_pieces ?? capturedPieces;
  
      sideToMoveSpan.textContent = sideToMove;
      renderCapturedPieces();
      renderBoard();
      reRenderThreeBoard({dimension: 5, spacing: 100, boxSize: 50, boardState, pieceGeomCallback});
    } catch (err) {
      console.error(err);
      alert("Failed to get AI move.");
    }
  }
  
  /**
   * あるマスをクリックされたときの処理
   * @param {string} squareId
   */
  export async function onSquareClick(squareId) {
    if (gameState !== "continue") {
      alert("Game is ended.");
      return;
    }
  
    // まだ移動元が未選択の場合
    if (!selectedSquare) {
      selectedSquare = squareId;
      const moves = await apiFetchMoves(gameId, selectedSquare);
      if (moves.length === 0) {
        selectedSquare = null;
        return;
      }else{
        highlightSquare(selectedSquare, "selected");
        possibleDestinations = moves;
        moves.forEach((sq) => highlightSquare(sq, "possible-move"));
      }
    } else {
      // 移動元が既に選択されている場合
      const fromSq = selectedSquare;
      const toSq = squareId;
  
      // ハイライト解除
      unhighlightSquare(fromSq, "selected");
      possibleDestinations.forEach((sq) => unhighlightSquare(sq, "possible-move"));
      selectedSquare = null;
  
      // 同じマスならキャンセル
      if (fromSq === toSq) {
        possibleDestinations = [];
        return;
      }
  
      // 移動先候補に含まれているかチェック
      if (!possibleDestinations.includes(toSq)) {
        possibleDestinations = [];
        return;
      }
  
      // movingPiece が Pawn かどうかを判定 ('P' or 'p')
      const movingPiece = boardState[fromSq];
      const isWhitePawn = movingPiece === "P";
      const isBlackPawn = movingPiece === "p";
  
      // プロモーションが必要になるか判定
      //   - 白: Level 'E' + ... + Row '5'
      //   - 黒: Level 'A' + ... + Row '1'
      const isWhitePromotion =
        isWhitePawn && toSq[0] === "E" && toSq[2] === "5";
      const isBlackPromotion =
        isBlackPawn && toSq[0] === "A" && toSq[2] === "1";
  
      if (isWhitePromotion) {
        const promoPiece = prompt(
          "White Promotion! Choose one of: Q, R, B, N, U",
          "Q"
        );
        await doApplyMove(fromSq, toSq, promoPiece);
      } else if (isBlackPromotion) {
        const promoPiece = prompt(
          "Black Promotion! Choose one of: q, r, b, n, u",
          "q"
        );
        await doApplyMove(fromSq, toSq, promoPiece);
      } else {
        // 通常の移動
        await doApplyMove(fromSq, toSq);
      }
    }
  }
  
  /**
   * applyMove ラッパ
   */
  async function doApplyMove(fromSq, toSq, promoPiece = null) {
    try {
      const data = await apiApplyMove(gameId, fromSq, toSq, promoPiece);
      if (data.error) {
        alert(data.error);
        return;
      }
      if (data.success) {
        boardState = data.board;
        sideToMove = data.side_to_move;
        capturedPieces = data.captured_pieces ?? capturedPieces;
        gameState = data.game_state;
        check = data.check;
  
        sideToMoveSpan.textContent = sideToMove;
        renderGameState();
        renderCapturedPieces();
        renderBoard();
        reRenderThreeBoard({dimension: 5, spacing: 100, boxSize: 50, boardState, pieceGeomCallback});
      }
    } catch (err) {
      console.error(err);
      alert("Failed to apply move.");
    }
  }
  
  /** ボードをHTML上に描画する */
  export function renderBoard() {
    console.log(boardState);
    boardContainer.innerHTML = "";
    selectedSquare = null;
    possibleDestinations = [];
  
    const LEVELS = ["A", "B", "C", "D", "E"];
    const ROWS = ["5", "4", "3", "2", "1"];
    const COLS = ["a", "b", "c", "d", "e"];
  
    LEVELS.forEach((lvl) => {
      const levelDiv = document.createElement("div");
      levelDiv.className = "level";
  
      const levelTitle = document.createElement("div");
      levelTitle.className = "level-title";
      levelTitle.textContent = `Level ${lvl}`;
      levelDiv.appendChild(levelTitle);
  
      ROWS.forEach((row) => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "row";
  
        COLS.forEach((col) => {
          const squareId = lvl + col + row;
          const squareDiv = document.createElement("div");
          squareDiv.className = "square";
          squareDiv.id = squareId;
          squareDiv.textContent = boardState[squareId] || ".";
  
          // クリック時に onSquareClick を呼ぶ
          squareDiv.addEventListener("click", () => onSquareClick(squareId));
          rowDiv.appendChild(squareDiv);
        });
        levelDiv.appendChild(rowDiv);
      });
  
      boardContainer.appendChild(levelDiv);
    });
  }
  
  /** 駒の捕獲リストを表示 */
  export function renderCapturedPieces() {
    // whiteCapturedSpan, blackCapturedSpan はinitGameLogicで取得しているDOM要素
    whiteCapturedSpan.textContent = capturedPieces.white.join(" ");
    blackCapturedSpan.textContent = capturedPieces.black.join(" ");
  }
  
  /** ゲーム状態(チェックメイトなど)の表示 */
  export function renderGameState() {
    if (gameState === "checkmate") {
      gameStateSpan.textContent = "Checkmate!";
      if (sideToMove === "white") {
        gameStateSpan.textContent += " Black wins!";
      } else {
        gameStateSpan.textContent += " White wins!";
      }
    } else if (gameState === "stalemate") {
      gameStateSpan.textContent = "Stalemate!";
    } else if (check) {
      gameStateSpan.textContent = "Check!";
    } else {
      gameStateSpan.textContent = "";
    }
  }
  
/**
 * 2D + 3D 両方でハイライトする関数
 * @param {string} squareId  - 例 "Ac2"
 * @param {string} className - CSSクラス名 (e.g. "selected", "possible-move")
 */
export function highlightSquare(squareId, className) {
  console.log("highlightSquare:", squareId, className);
  // ---------- 2D のハイライト処理 ----------
  const elem = document.getElementById(squareId);
  if (elem) {
    elem.classList.add(className);
  }

  // ---------- 3D のハイライト処理 ----------
  highlightSquare3D(squareId, className);
}

/**
 * 2D + 3D 両方のハイライト解除
 */
export function unhighlightSquare(squareId, className) {
  // ---------- 2D の解除 ----------
  const elem = document.getElementById(squareId);
  if (elem) {
    elem.classList.remove(className);
  }

  // ---------- 3D の解除 ----------
  // もし squareId 単位ではなくハイライトBox全体を消すだけなら
  // highlightSquare3D() 相当の squareId を判定する必要がない
  // → unhighlightSquare3D() を呼ぶだけ
  unhighlightSquare3D(squareId);
}

  // "white" → sphere, "black" → tetrahedron, "." → null, etc...
export function pieceGeomCallback(pieceChar) {
  console.log("pieceGeomCallback called with:", pieceChar);
  if (pieceChar === ".") {
    return new THREE.BoxGeometry(30,30,30);
  }
  // たとえば 大文字 = white, 小文字 = black など
  const isWhite = (pieceChar === pieceChar.toUpperCase());
  if (isWhite) {
    return new THREE.SphereGeometry(40, 32, 32);
  } else {
    // Tetrahedron or other
    return new createIndexedTetrahedronGeometry(60);
  }
}

function createIndexedTetrahedronGeometry(radius = 1) {
    // 頂点座標（辺=1の正四面体）
    const positions = [
      0.5, 0.5, 0.5,                                  // A(0)
      -0.5, -0.5, 0.5,                                  // B(1)
      0.5, -0.5,-0.5,                 // C(2)
      -0.5, 0.5, -0.5   // D(3)
    ];
  
    // 面（インデックス）
    const indices = [
      0, 1, 2,  // ABC
      0, 2, 3,  // ACD
      1, 3, 2,  // BDC
      0, 3, 1   // ADB
    ];
  
    // UV座標（テクスチャ座標）
    const uvs = [
      0, 0,  // A(0)
      1, 0,  // B(1)
      0.5, 1, // C(2)
      0.5, 0.5 // D(3)
    ];
  
    // BufferGeometry を作成
    const geometry = new THREE.BufferGeometry();
  
    // position attribute
    const scaledPositions = [];
    for (let i = 0; i < positions.length; i += 3) {
      scaledPositions.push(
        positions[i + 0] * radius,
        positions[i + 1] * radius,
        positions[i + 2] * radius
      );
    }
  
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(scaledPositions), 3)
    );
  
    // UV attribute
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Float32Array(uvs), 2)
    );
  
    // index attribute
    geometry.setIndex(
      new THREE.Uint16BufferAttribute(new Uint16Array(indices), 1)
    );
  
    // 法線を自動計算
    geometry.computeVertexNormals();
  
    return geometry;
  }
