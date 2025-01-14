// script.js
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

let container, stats;
let camera, controls, scene, renderer;
let pickingTexture, pickingScene;
let highlightBox;

const pickingData = [];

const pointer = new THREE.Vector2();
const offset = new THREE.Vector3(10, 10, 10);
const clearColor = new THREE.Color();

init();

function init() {

  container = document.getElementById('container');

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.y = 1000;
  camera.position.x = -500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  scene.add(new THREE.AmbientLight(0xcccccc));

  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(0, 500, 2000);
  scene.add(light);

  const defaultMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    flatShading: true,
    vertexColors: true,
    shininess: 0,
    transparent: true, // 半透明を有効化
    opacity: 0.3,       // 50%の不透明度（半透明）
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // set up the picking texture to use a 32 bit integer so we can write and read integer ids from it
  pickingScene = new THREE.Scene();
  pickingTexture = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.IntType,
    format: THREE.RGBAIntegerFormat,
    internalFormat: 'RGBA32I'
  });

  const pickingMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: /* glsl */ `
      attribute int id;
      flat varying int vid;
      void main() {
        vid = id;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out int out_id;
      flat varying int vid;
      void main() {
        out_id = vid;
      }
    `,
  });
  
  function getPieceSide(piece) {
    if (piece === ".") {
        return "none"
    }
    else if (piece === piece.toUpperCase()) {
        return "white"
    }
    else if (piece === piece.toLowerCase()) {
        return "black"
    }
  }
  
  function getPieceColor(piece) {
    piece = piece.toUpperCase()
    switch (piece) {
        case "P":
            return 0x000000;
        case "N":
            return 0xFFff00;
        case "B":
            return 0xff77FF;
        case "R":
            return 0x00ffff;
        case "Q":
            return 0x0000ff;
        case "K":
            return 0xFF0000;
        case "U":
            return 0xffff00;
        default:    // empty square
            return 0xFFFFFF;
    }
  }
  const sample_board = {
    "Aa1": "R",
    "Aa2": "P",
    "Aa3": ".",
    "Aa4": ".",
    "Aa5": ".",
    "Ab1": "N",
    "Ab2": "P",
    "Ab3": ".",
    "Ab4": ".",
    "Ab5": ".",
    "Ac1": "K",
    "Ac2": "P",
    "Ac3": ".",
    "Ac4": ".",
    "Ac5": ".",
    "Ad1": "N",
    "Ad2": "P",
    "Ad3": ".",
    "Ad4": ".",
    "Ad5": ".",
    "Ae1": "R",
    "Ae2": "P",
    "Ae3": ".",
    "Ae4": ".",
    "Ae5": ".",
    "Ba1": "B",
    "Ba2": "P",
    "Ba3": ".",
    "Ba4": ".",
    "Ba5": ".",
    "Bb1": "U",
    "Bb2": "P",
    "Bb3": ".",
    "Bb4": ".",
    "Bb5": ".",
    "Bc1": "Q",
    "Bc2": "P",
    "Bc3": ".",
    "Bc4": ".",
    "Bc5": ".",
    "Bd1": "B",
    "Bd2": "P",
    "Bd3": ".",
    "Bd4": ".",
    "Bd5": ".",
    "Be1": "U",
    "Be2": "P",
    "Be3": ".",
    "Be4": ".",
    "Be5": ".",
    "Ca1": ".",
    "Ca2": ".",
    "Ca3": ".",
    "Ca4": ".",
    "Ca5": ".",
    "Cb1": ".",
    "Cb2": ".",
    "Cb3": ".",
    "Cb4": ".",
    "Cb5": ".",
    "Cc1": ".",
    "Cc2": ".",
    "Cc3": ".",
    "Cc4": ".",
    "Cc5": ".",
    "Cd1": ".",
    "Cd2": ".",
    "Cd3": ".",
    "Cd4": ".",
    "Cd5": ".",
    "Ce1": ".",
    "Ce2": ".",
    "Ce3": ".",
    "Ce4": ".",
    "Ce5": ".",
    "Da1": ".",
    "Da2": ".",
    "Da3": ".",
    "Da4": "p",
    "Da5": "b",
    "Db1": ".",
    "Db2": ".",
    "Db3": ".",
    "Db4": "p",
    "Db5": "u",
    "Dc1": ".",
    "Dc2": ".",
    "Dc3": ".",
    "Dc4": "p",
    "Dc5": "q",
    "Dd1": ".",
    "Dd2": ".",
    "Dd3": ".",
    "Dd4": "p",
    "Dd5": "b",
    "De1": ".",
    "De2": ".",
    "De3": ".",
    "De4": "p",
    "De5": "u",
    "Ea1": ".",
    "Ea2": ".",
    "Ea3": ".",
    "Ea4": "p",
    "Ea5": "r",
    "Eb1": ".",
    "Eb2": ".",
    "Eb3": ".",
    "Eb4": "p",
    "Eb5": "n",
    "Ec1": ".",
    "Ec2": ".",
    "Ec3": ".",
    "Ec4": "p",
    "Ec5": "k",
    "Ed1": ".",
    "Ed2": ".",
    "Ed3": ".",
    "Ed4": "p",
    "Ed5": "n",
    "Ee1": ".",
    "Ee2": ".",
    "Ee3": ".",
    "Ee4": "p",
    "Ee5": "r"
}

function unifyGeometry( geometry, idValue ) {

    // 1. もし geometry.index が存在するなら toNonIndexed() で揃える
    if ( geometry.index ) {
      geometry = geometry.toNonIndexed();
    }
  
    // 2. morphAttributes を削除 (不要なら)
    delete geometry.morphAttributes;
  
    // 3. 'id' 属性を Int16 or Float32 で作り直す / 付与する
    //    Tetrahedron, Box, Sphere 間で同じ型にする
    const pos = geometry.attributes.position;
    if ( pos ) {
      const count = pos.count;
      // Int16 で統一する例
      const arr = new Int16Array(count);
      arr.fill(idValue);
      const idAttr = new THREE.Int16BufferAttribute(arr, 1);
      idAttr.gpuType = THREE.IntType; // WebGL2 で整数属性を使うとき
      geometry.deleteAttribute('id');
      geometry.setAttribute('id', idAttr);
    }
  
    return geometry;
  }
  

  function renderBoard(BoardState) {
    const LEVELS = ["A", "B", "C", "D", "E"];
    const ROWS = ["5", "4", "3", "2", "1"];
    const COLS = ["a", "b", "c", "d", "e"];
    let idCounter = 0;

    LEVELS.forEach(lvl => {
      ROWS.forEach(row => {
        COLS.forEach(col => {
          const squareId = lvl + col + row;
          const side = getPieceSide(boardState[squareId]);
          const color_id = getPieceColor(boardState[squareId]);


          let geometry; 
          if (side == "white") {
            geometry =  new THREE.SphereGeometry( boxSize, 32, 32);
        } else if(side == "black"){
            geometry =  new THREE.TetrahedronGeometry( boxSize, 0 );
          }else {
            geometry = new THREE.BoxGeometry( boxSize, boxSize, boxSize );
          }
            // 位置ベクトルを計算
            // 中心が (0,0,0) に来るようにオフセット
            const offsetX = - (dimension - 1) * spacing / 2;
            const offsetY = - (dimension - 1) * spacing / 2;
            const offsetZ = - (dimension - 1) * spacing / 2;

            const position = new THREE.Vector3(
                ix * spacing + offsetX,
                iy * spacing + offsetY,
                iz * spacing + offsetZ
            );

            // 回転は固定にする（回転させたければここで設定）
            const rotation = new THREE.Euler( 0, 0, 0 );

            // スケールは 1.0（等倍）
            const scale = new THREE.Vector3(1, 1, 1);

            // 行列合成
            quaternion.setFromEuler(rotation);
            matrix.compose(position, quaternion, scale);
            geometry.applyMatrix4(matrix);

            // 頂点色（ランダム色）と ID を付与
            color.setHex( color_id );
            applyVertexColors( geometry, color );
            applyId( geometry, idCounter );

            geometries.push( geometry );

            // ピッキング時に使うデータも格納（位置/回転/スケール）
            pickingData[idCounter] = {
                position: position,
                rotation: rotation,
                scale: scale
            };
          
        });
      });
    });
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
  

  function applyId(geometry, id) {

    const position = geometry.attributes.position;
    const array = new Int16Array(position.count);
    array.fill(id);

    const bufferAttribute = new THREE.Int16BufferAttribute(array, 1, false);
    bufferAttribute.gpuType = THREE.IntType; // custom prop to keep track
    geometry.setAttribute('id', bufferAttribute);

  }

  function applyVertexColors(geometry, color) {

    const position = geometry.attributes.position;
    const colors = [];

    for (let i = 0; i < position.count; i++) {
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  }

  const geometries = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();

  const dimension = 5;         // X, Y, Z の各方向に 5 個ずつ
  const spacing = 100;         // ボックス間の距離（間隔）
  const boxSize = 50;         // ボックス自体の大きさ
  let idCounter = 0;

const LEVELS = ["A", "B", "C", "D", "E"];
const ROWS = ["5", "4", "3", "2", "1"];
const COLS = ["a", "b", "c", "d", "e"];

// boardState, getPieceSide, getPieceColor, sample_board は既存の前提とする
const boardState = sample_board;  

// 3D座標として ix, iy, iz をループ内で管理
// → forEachを入れ子にする場合、外側から順にリセットするのがポイント

for ( let ix = 0; ix < dimension; ix++ ) {
    for ( let iy = 0; iy < dimension; iy++ ) {
      for ( let iz = 0; iz < dimension; iz++ ) {
        const squareId = LEVELS[ix] + COLS[iz] + ROWS[iy];
        const side = getPieceSide(boardState[squareId]);
        const color_id = getPieceColor(boardState[squareId]);
        color.setHex(color_id);

        let geometry; 
        //geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        if (side === "white") {
            // 白 → 球体
            geometry = new THREE.SphereGeometry(boxSize*0.9, 32, 32);
        } 
        else if (side === "black") {
            // 黒 → 正四面体
            geometry = createIndexedTetrahedronGeometry(boxSize*1.5);
        } 
        else {
        //     // それ以外 → 立方体
            geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        }

        // 中心が(0,0,0)に来るようにオフセット
        const offsetX = - (dimension - 1) * spacing / 2;
        const offsetY = - (dimension - 1) * spacing / 2;
        const offsetZ = - (dimension - 1) * spacing / 2;

        // (ix, iy, iz) を使って位置を計算
        const position = new THREE.Vector3(
            ix * spacing + offsetX,
            iy * spacing + offsetY,
            iz * spacing + offsetZ
        );

        // 回転は固定(0,0,0)とし、スケールは等倍(1,1,1)
        const rotation = new THREE.Euler(0, 0, 0);
        const scale = new THREE.Vector3(1, 1, 1);

        // 行列合成して geometry に適用
        quaternion.setFromEuler(rotation);
        matrix.compose(position, quaternion, scale);
        geometry.applyMatrix4(matrix);

        // 頂点カラー & ピッキングIDを付与
        applyVertexColors(geometry, color);
        applyId(geometry, idCounter);

        //geometry = unifyGeometry( geometry, idCounter /* など */ );
        geometries.push(geometry);

        // ピッキング用データを記録
        pickingData[idCounter] = {
            position: position,
            rotation: rotation,
            scale: scale
        };

        idCounter++;
        }
    }
}

  for (let i = 0; i < geometries.length; i++) {
    const geometry = geometries[i];
    console.log(Object.keys(geometry.attributes).length)
  }
  console.log(geometries)
  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
  scene.add(new THREE.Mesh(mergedGeometry, defaultMaterial));
  pickingScene.add(new THREE.Mesh(mergedGeometry, pickingMaterial));

  highlightBox = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xffff00 })
  );
  scene.add(highlightBox);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);

  controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 5.0;
  controls.zoomSpeed = 3;
  controls.panSpeed = 0.8;
  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;

  stats = new Stats();
  container.appendChild(stats.dom);

  renderer.domElement.addEventListener('pointermove', onPointerMove);

}

function onPointerMove(e) {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}

function animate() {
  render();
  stats.update();
}

function pick() {
  // render the picking scene off-screen
  // set the view offset to represent just a single pixel under the mouse
  const dpr = window.devicePixelRatio;
  camera.setViewOffset(
    renderer.domElement.width, renderer.domElement.height,
    Math.floor(pointer.x * dpr), Math.floor(pointer.y * dpr),
    1, 1
  );

  // render the scene
  renderer.setRenderTarget(pickingTexture);

  // clear the background to -1 meaning no item was hit
  clearColor.setRGB(-1, -1, -1);
  renderer.setClearColor(clearColor);
  renderer.render(pickingScene, camera);

  // clear the view offset so rendering returns to normal
  camera.clearViewOffset();

  // create buffer for reading single pixel
  const pixelBuffer = new Int32Array(4);

  // read the pixel
  renderer
    .readRenderTargetPixelsAsync(pickingTexture, 0, 0, 1, 1, pixelBuffer)
    .then(() => {
      const id = pixelBuffer[0];
      if (id !== -1) {
        // move our highlightBox so that it surrounds the picked object
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

function render() {
  controls.update();
  pick();
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}
