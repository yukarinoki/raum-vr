// threescene.js
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { onSquareClick } from './gameLogic.js';

let container, stats;
let camera, controls, scene, renderer;
let pickingTexture, pickingScene;
let highlightBox;

const highlightBoxes = {};

// すでにシーンに追加した mainMesh & pickingMesh を保持し、再描画時に remove する
let mainMesh = null;
let pickingMesh = null;

const pickingData = []; // ピッキング用ID => 位置/回転/スケール
const pointer = new THREE.Vector2();
const offset = new THREE.Vector3(10, 10, 10);
const clearColor = new THREE.Color();

const defaultMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  flatShading: true,
  vertexColors: true,
  shininess: 0,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  side: THREE.DoubleSide
});
const pickingMaterial = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: /* glsl */`
    attribute int id;
    flat varying int vid;
    void main() {
      vid = id;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    layout(location = 0) out int out_id;
    flat varying int vid;
    void main() {
      out_id = vid;
    }
  `,
});



function createHighlightBox() {
  const geom = new THREE.BoxGeometry(0.9,0.9, 0.9);
  const mat = new THREE.MeshBasicMaterial({ color: 0x4db56a });
  const box = new THREE.Mesh(geom, mat);
  box.visible = false;
  return box;
}

/**
 * Three.js シーンを初期化し、アニメーションループを開始する
 * 
 * @param {HTMLDivElement} containerElem - 3Dを表示するDOM要素
 * @param {Object} options - ボード構築に必要な情報
 *   - dimension, spacing, boxSize, boardState, pieceGeomCallback
 */
export function initThreeScene(
  containerElem,
  { dimension, spacing, boxSize, boardState, pieceGeomCallback }
) {
  container = containerElem;

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(-500, 1000, 0);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // ライト
  scene.add(new THREE.AmbientLight(0xcccccc));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(0, 500, 2000);
  scene.add(light);

  // ピッキング用シーンとテクスチャ
  pickingScene = new THREE.Scene();
  pickingTexture = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.IntType,
    format: THREE.RGBAIntegerFormat,
    internalFormat: 'RGBA32I'
  });

  // レンダラー
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);

  // コントロール
  controls = new TrackballControls(camera, renderer.domElement);
  controls.target.set(0,0,0)
  controls.rotateSpeed = 5.0;
  controls.zoomSpeed = 3;
  controls.panSpeed = 0.8;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;

  // stats
  stats = new Stats();
  container.appendChild(stats.dom);

  // ハイライトボックス
  highlightBox = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xffff00 })
  );
  scene.add(highlightBox);

  // 最初の一回、3Dオブジェクトを生成
  reRenderThreeBoard({ dimension, spacing, boxSize, boardState, pieceGeomCallback });

  // イベント
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('resize', onWindowResize);
}

/**
 * ゲーム状態が変わったり boardState が変わったときに呼び出すと、
 * 3D ボードを再生成してシーンに反映し直す
 */
export function reRenderThreeBoard({
  dimension,
  spacing,
  boxSize,
  boardState,
  pieceGeomCallback
}) {
  // もし古い mesh が存在すれば、scene / pickingScene から取り除く
  if (mainMesh) {
    scene.remove(mainMesh);
    pickingScene.remove(pickingMesh);
    mainMesh.geometry.dispose();
    pickingMesh.geometry.dispose();
    mainMesh = null;
    pickingMesh = null;
  }

  // 新たに mergedGeometry を生成
  const { mergedGeometry } = createMergedBoardGeometry({
    dimension,
    spacing,
    boxSize,
    boardState,
    pieceGeomCallback
  });
  if (!mergedGeometry) {
    console.warn("reRenderThreeBoard: mergedGeometry is null/undefined");
    return;
  }

  // 新たにメッシュを作り scene に追加
  mainMesh = new THREE.Mesh(mergedGeometry, defaultMaterial);
  pickingMesh = new THREE.Mesh(mergedGeometry, pickingMaterial);

  scene.add(mainMesh);
  pickingScene.add(pickingMesh);
}

/** ------------------------------------------
 * 以下、内部実装 (createMergedBoardGeometry, etc.)
 * -----------------------------------------*/


function getPieceVisual(piece) {
  piece = piece.toUpperCase();
  switch (piece) {
    case "P": return { color: 0x000000, opacity: 0.3 };
    case "N": return { color: 0xffff00, opacity: 0.3 };
    case "B": return { color: 0xff77ff, opacity: 0.3 };
    case "R": return { color: 0x00ffff, opacity: 0.3 };
    case "Q": return { color: 0x0000ff, opacity: 0.3 };
    case "K": return { color: 0xff0000, opacity: 0.8 };
    case "U": return { color: 0xffff00, opacity: 0.3 };
    default:  return { color: 0xffffff, opacity: 0.3 };
  }
}

function applyVertexColors(geometry, color) {
  const pos = geometry.attributes.position;
  const colors = [];
  // color is THREE.Color
  for (let i = 0; i < pos.count; i++) {
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Float32Array(colors), 3)
  );
}


/**
 * あるボード状態(boardState)をもとに 3Dジオメトリを作成・マージする
 * @param {Object} params
 *   - dimension, spacing, boxSize, boardState, pieceGeomCallback
 * @returns { mergedGeometry: THREE.BufferGeometry }
 */
function createMergedBoardGeometry({
  dimension,
  spacing,
  boxSize,
  boardState,
  pieceGeomCallback
}) {
  const geometries = [];
  pickingData.length = 0; // リセット

  const LEVELS = ["A", "B", "C", "D", "E"];
  const ROWS = ["5", "4", "3", "2", "1"];
  const COLS = ["a", "b", "c", "d", "e"];

  let idCounter = 0;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();


  for (let ix = 0; ix < dimension; ix++) {
    for (let iy = 0; iy < dimension; iy++) {
      for (let iz = 0; iz < dimension; iz++) {
        const squareId = LEVELS[ix] + COLS[iz] + ROWS[iy];
        const pieceChar = boardState[squareId] || ".";
        const geometry = pieceGeomCallback(pieceChar);
        if (!geometry) continue; // 何も描画しない場合
  
        // (A) 駒文字に応じた色＆透明度を取得
        const { color: pieceColor, opacity: pieceOpacity } = getPieceVisual(pieceChar);
  
        // 必要なら "頂点カラー" を反映
        // 例: applyVertexColors(geometry, pieceColor)
        {
          const c = new THREE.Color(pieceColor);
          applyVertexColors(geometry, c);
        }
  
        // 必要なら geometryに userData で opacity を持たせる等
        // ただし mergeGeometries() 後は 個別のmaterialは使えません
        // geometry.userData = { pieceOpacity: pieceOpacity };
  
        // 位置オフセット計算
        const offsetX = -(dimension - 1) * spacing / 2;
        const offsetY = -(dimension - 1) * spacing / 2;
        const offsetZ = -(dimension - 1) * spacing / 2;
  
        const position = new THREE.Vector3(
          ix * spacing + offsetX,
          iy * spacing + offsetY,
          iz * spacing + offsetZ
        );
  
        quaternion.setFromEuler(new THREE.Euler(0, 0, 0));
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        geometry.applyMatrix4(matrix);
  
        applyId(geometry, idCounter);
        geometries.push(geometry);
  
        pickingData[idCounter] = {
          squareId: squareId,
          position: position.clone(),
          rotation: new THREE.Euler(0, 0, 0),
          scale: new THREE.Vector3(2, 2, 2)
        };
        idCounter++;
      }
    }
  }
  
  if (geometries.length === 0) {
    console.warn("No geometry was generated. Are all squares '.'?");
    return { mergedGeometry: null };
  }

  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
  return { mergedGeometry };
}

function applyId(geometry, idValue) {
  const pos = geometry.attributes.position;
  const arr = new Int16Array(pos.count);
  arr.fill(idValue);
  const idAttr = new THREE.Int16BufferAttribute(arr,1);
  idAttr.gpuType = THREE.IntType;
  geometry.setAttribute('id', idAttr);
}

/** 毎フレームのアニメ処理 */
function animate() {
  render();
  stats.update();
}

/** レンダリング */
function render() {
  controls.update();
  pick();
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

/** ピクセル拾い(1px) してハイライト処理 */
function pick() {
  const dpr = window.devicePixelRatio;
  camera.setViewOffset(
    renderer.domElement.width, renderer.domElement.height,
    Math.floor(pointer.x * dpr),
    Math.floor(pointer.y * dpr),
    1, 1
  );

  renderer.setRenderTarget(pickingTexture);
  clearColor.setRGB(-1, -1, -1);
  renderer.setClearColor(clearColor);
  renderer.render(pickingScene, camera);
  camera.clearViewOffset();

  const pixelBuffer = new Int32Array(4);
  renderer.readRenderTargetPixelsAsync(pickingTexture, 0, 0, 1, 1, pixelBuffer)
    .then(() => {
      const id = pixelBuffer[0];
      if (id !== -1) {
        const data = pickingData[id];
        highlightBox.position.copy(data.position);
        highlightBox.rotation.copy(data.rotation);
        highlightBox.scale.copy(data.scale).add(offset);
        highlightBox.visible = true;

      } else {
        highlightBox.visible = false;
      }
    });
}

/** マウス移動 */
function onPointerMove(e) {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}

/** ウィンドウリサイズ */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}


/**
 * highlightSquare3D
 * 指定した squareId の位置に highlightBox を表示する。
 * @param {string} squareId - 例: "Ac2"
 */
export function highlightSquare3D(squareId, className) {
  // 1) 既に highlightBoxes[squareId] があるなら再利用、なければ作る
  let hbox = highlightBoxes[squareId];
  if (!hbox) {
    hbox = createHighlightBox();
    highlightBoxes[squareId] = hbox;
    scene.add(hbox);
  }

  // 2) squareId -> position, rotation, scale を求める
  let found = null;
  for (const id in pickingData) {
    const data = pickingData[id];
    if (data.squareId === squareId) {
      found = data;
      break;
    }
  }
  if (!found) {
    console.warn(`No 3D data for squareId = ${squareId}`);
    hbox.visible = false;
    return;
  }

  hbox.position.copy(found.position);
  hbox.rotation.copy(found.rotation);
  hbox.scale.copy(found.scale).add(new THREE.Vector3(10,10,10));
  hbox.visible = true; // 表示
}

/** 非表示にする場合 */
export function unhighlightSquare3D(squareId) {
  const hbox = highlightBoxes[squareId];
  if (hbox) {
    hbox.visible = false;
    // scene.remove(hbox); // 必要なら remove
  }
}
function unhighlightAllSquares3D() {
  for (const sqId in highlightBoxes) {
    highlightBoxes[sqId].visible = false;
  }
}


function onPointerDown(e) {
  if (e.button === 0) {
    pickOnPointerDown(e.clientX, e.clientY);
  }
}

function pickOnPointerDown(clientX, clientY) {
  // pickingTexture に1px描画して id を取得
  const dpr = window.devicePixelRatio;
  camera.setViewOffset(
    renderer.domElement.width, renderer.domElement.height,
    Math.floor(clientX * dpr), Math.floor(clientY * dpr),
    1, 1
  );

  renderer.setRenderTarget(pickingTexture);
  clearColor.setRGB(-1, -1, -1);
  renderer.setClearColor(clearColor);
  renderer.render(pickingScene, camera);
  camera.clearViewOffset();

  const pixelBuffer = new Int32Array(4);
  renderer.readRenderTargetPixelsAsync(pickingTexture, 0, 0, 1, 1, pixelBuffer).then(() => {
    const id = pixelBuffer[0];
    if (id !== -1) {
      const data = pickingData[id];
      // ハイライトボックスの移動はお好みで
      // highlightBox.position.copy(data.position);
      // highlightBox.rotation.copy(data.rotation);
      // highlightBox.scale.copy(data.scale).add(offset);
      // highlightBox.visible = true;

      // ここで onSquareClick
      if (data.squareId) {
        unhighlightAllSquares3D();
        onSquareClick(data.squareId);
      }
    } else {
      highlightBox.visible = false;
    }
  });
}
