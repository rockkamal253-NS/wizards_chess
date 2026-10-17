import { state } from './state.js';
import {
  cg,
  cmat,
  SQ_SIZE,
  MAT_TILE_LIGHT,
  MAT_TILE_DARK,
  MAT_MARBLE_BODY,
  MAT_MARBLE_BRONZE,
  MAT_OBSIDIAN_BODY,
  MAT_OBSIDIAN_CRIMSON
} from './materials.js';
import { buildPieceMesh } from './pieces.js';
import { sfx } from './audio.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function sqToWorld(sqName) {
  const file = sqName.charCodeAt(0) - 97;
  const rank = parseInt(sqName[1], 10) - 1;
  return new THREE.Vector3((file - 3.5) * SQ_SIZE, 0, (3.5 - rank) * SQ_SIZE);
}

export const boardGroup = new THREE.Group();
export const markerGroup = new THREE.Group();
export const hoverCursor = new THREE.Group();

export function initBoard(scene) {
  scene.add(boardGroup);
  scene.add(markerGroup);
  state.markerGroup = markerGroup;

  // Live 3D Hover Cursor Ring
  const hOuter = new THREE.Mesh(
    cg(THREE.RingGeometry, 0.52, 0.60, 4),
    new THREE.MeshBasicMaterial({ color: 0xF2C96D, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
  );
  hOuter.rotation.x = Math.PI / 2;
  hOuter.rotation.z = Math.PI / 4;
  hoverCursor.add(hOuter);
  hoverCursor.position.y = 0.012;
  hoverCursor.visible = false;
  scene.add(hoverCursor);

  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = FILES[f] + r;
      const isLight = (f + r) % 2 === 0; // a1 (f=0, r=1) is dark; each player's right-hand corner is light
      const mat = (isLight ? MAT_TILE_LIGHT : MAT_TILE_DARK).clone();
      const tile = new THREE.Mesh(cg(THREE.BoxGeometry, SQ_SIZE * 0.994, 0.14, SQ_SIZE * 0.994), mat);
      const pos = sqToWorld(sq);
      tile.position.set(pos.x, -0.07, pos.z);
      tile.receiveShadow = true;
      tile.userData = { sq, isLight, baseHex: mat.color.getHex() };
      boardGroup.add(tile);
      state.squareMeshes[sq] = tile;
    }
  }
}

// Tile highlights are additive (emissive), so they read the same on light and dark squares
export function tintTile(tile, hex, strength) {
  tile.material.emissive.setHex(hex);
  tile.material.emissiveIntensity = strength * (tile.userData.isLight ? 0.55 : 1.0);
}

export function rebuildTacticalMarkers() {
  while (markerGroup.children.length > 0) {
    markerGroup.remove(markerGroup.children[0]);
  }
  state.animatedMarkers.length = 0;

  // Reset tile colors first
  for (const sq in state.squareMeshes) {
    const tile = state.squareMeshes[sq];
    tile.material.emissive.setHex(0x000000);
    tile.material.emissiveIntensity = 1;
  }

  // 1. Last Move Trail
  if (state.lastMove) {
    [state.lastMove.from, state.lastMove.to].forEach(sq => {
      const tile = state.squareMeshes[sq];
      if (tile) tintTile(tile, 0xC9962E, 0.55);
    });
  }

  // 2. Tactical Hint Highlight
  if (state.hintMove) {
    [state.hintMove.from, state.hintMove.to].forEach(sq => {
      const pos = sqToWorld(sq);
      const ring = new THREE.Mesh(
        cg(THREE.RingGeometry, 0.42, 0.56, 24),
        cmat({ color: 0x00E5FF, side: THREE.DoubleSide })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pos.x, 0.02, pos.z);
      markerGroup.add(ring);
    });
  }

  // 3. Selected Square Runic Frame
  if (state.selectedSq) {
    const tile = state.squareMeshes[state.selectedSq];
    if (tile) tintTile(tile, 0x8A5CFF, 0.7);
    const pos = sqToWorld(state.selectedSq);
    const selRing = new THREE.Mesh(
      cg(THREE.RingGeometry, 0.46, 0.58, 32),
      cmat({ color: 0xD0BCFF, side: THREE.DoubleSide })
    );
    selRing.rotation.x = Math.PI / 2;
    selRing.position.set(pos.x, 0.018, pos.z);
    markerGroup.add(selRing);
  }

  // 4. Valid Destination Squares (Dual-Contrast Obsidian Outline + Glowing Core + 3D Pip)
  state.validMoves.forEach(vm => {
    const tile = state.squareMeshes[vm.to];
    const pos = sqToWorld(vm.to);
    const g = new THREE.Group();
    g.position.set(pos.x, 0.018, pos.z);

    if (vm.captured) {
      // CAPTURE TARGET: High-Contrast Crimson Tile Tint + Dark Rim + Pulsing Target Ring
      if (tile) tintTile(tile, 0xE02344, 0.8);

      const darkRim = new THREE.Mesh(
        cg(THREE.RingGeometry, 0.46, 0.60, 32),
        cmat({ color: 0x120B18, side: THREE.DoubleSide })
      );
      darkRim.rotation.x = Math.PI / 2;

      const redCore = new THREE.Mesh(
        cg(THREE.RingGeometry, 0.49, 0.57, 32),
        cmat({ color: 0xFF2A4B, side: THREE.DoubleSide })
      );
      redCore.rotation.x = Math.PI / 2;
      redCore.position.y = 0.004;

      const oct = new THREE.Mesh(
        cg(THREE.OctahedronGeometry, 0.14, 0),
        cmat({ color: 0xFF2A4B })
      );
      oct.position.y = 2.15; // Floating above enemy piece
      g.add(darkRim, redCore, oct);
      state.animatedMarkers.push({ mesh: oct, type: 'capture' });
    } else {
      // QUIET MOVE: Emerald Tile Tint + Dark Obsidian Contrast Ring + Bright Emerald Core + 3D Diamond Pip
      if (tile) tintTile(tile, 0x12C87A, 0.6);

      const contrastRing = new THREE.Mesh(
        cg(THREE.RingGeometry, 0.18, 0.34, 28),
        cmat({ color: 0x12101B, side: THREE.DoubleSide })
      );
      contrastRing.rotation.x = Math.PI / 2;

      const emeraldRing = new THREE.Mesh(
        cg(THREE.RingGeometry, 0.21, 0.31, 28),
        cmat({ color: 0x10F58C, side: THREE.DoubleSide })
      );
      emeraldRing.rotation.x = Math.PI / 2;
      emeraldRing.position.y = 0.004;

      const pip = new THREE.Mesh(
        cg(THREE.OctahedronGeometry, 0.11, 0),
        cmat({ color: 0x10F58C })
      );
      pip.position.y = 0.16;
      g.add(contrastRing, emeraldRing, pip);
      state.animatedMarkers.push({ mesh: pip, type: 'quiet' });
    }

    markerGroup.add(g);
  });

  // 5. King in Check Crimson Beacon
  if (state.game.in_check()) {
    const turnColor = state.game.turn();
    for (const sq in state.pieceMeshes) {
      const pm = state.pieceMeshes[sq];
      if (pm.userData.type === 'k' && pm.userData.colorChar === turnColor) {
        if (state.squareMeshes[sq]) tintTile(state.squareMeshes[sq], 0xFF1F3F, 1.0);
      }
    }
  }
}

export function syncBoardFull(scene) {
  Object.values(state.pieceMeshes).forEach(m => scene.remove(m));
  for (const k in state.pieceMeshes) delete state.pieceMeshes[k];

  const sourceGame = state.replayGame || state.game;

  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = FILES[f] + r;
      const p = sourceGame.get(sq);
      if (p) {
        const mesh = buildPieceMesh(p.type, p.color);
        mesh.position.copy(sqToWorld(sq));
        mesh.userData.sq = sq;
        scene.add(mesh);
        state.pieceMeshes[sq] = mesh;
      }
    }
  }
}

export function spawnShatter(worldPos, colorChar, impactDir, scene) {
  sfx.playShatter();
  const mainMat = colorChar === 'w' ? MAT_MARBLE_BODY : MAT_OBSIDIAN_BODY;
  const accMat = colorChar === 'w' ? MAT_MARBLE_BRONZE : MAT_OBSIDIAN_CRIMSON;

  for (let i = 0; i < 36; i++) {
    const baseScale = 0.06 + Math.random() * 0.11;
    const mesh = new THREE.Mesh(cg(THREE.DodecahedronGeometry, 1, 0), i % 4 === 0 ? accMat : mainMat);
    mesh.scale.setScalar(baseScale);
    mesh.position.copy(worldPos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      0.2 + Math.random() * 1.2,
      (Math.random() - 0.5) * 0.4
    ));
    mesh.castShadow = true;
    scene.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 5.8 + impactDir.x * 3.8,
      2.8 + Math.random() * 6.2,
      (Math.random() - 0.5) * 5.8 + impactDir.z * 3.8
    );
    const rotVel = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14
    );
    state.shards.push({ mesh, vel, rotVel, baseScale, age: 0, life: 2.2 + Math.random() * 1.2 });
  }
}

export function clearSelection() {
  state.selectedSq = null;
  state.validMoves = [];
  rebuildTacticalMarkers();
}
