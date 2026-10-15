import { dom } from './dom.js';
import { buildCathedralHDRI, createStoneTextures } from './textures.js';

// ============================================================================
// SHARED GEOMETRY/MATERIAL CACHES
// ============================================================================
const _geoCache = new Map();
export function cg(Ctor, ...args) {
  let byArgs = _geoCache.get(Ctor);
  if (!byArgs) {
    byArgs = new Map();
    _geoCache.set(Ctor, byArgs);
  }
  const key = args.join(',');
  let g = byArgs.get(key);
  if (!g) {
    g = new Ctor(...args);
    byArgs.set(key, g);
  }
  return g;
}

const _matCache = new Map();
export function cmat(opts) {
  const key = Object.entries(opts).map(([k, v]) => k + '=' + v).join('|');
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial(opts);
    _matCache.set(key, m);
  }
  return m;
}

// ============================================================================
// THREE.JS RENDERER & SCENE SETUP
// ============================================================================
export const canvas = dom.canvas;
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputEncoding = THREE.sRGBEncoding;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09080F);
scene.fog = new THREE.FogExp2(0x09080F, 0.008);

export const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 120);

scene.environment = buildCathedralHDRI(renderer, cg);

// ============================================================================
// TEXTURES & FACTION MATERIALS
// ============================================================================
export const marbleTex = createStoneTextures(renderer, true);
export const obsidianTex = createStoneTextures(renderer, false);
export const tileLightTex = createStoneTextures(renderer, true, '#E6DECF');
export const tileDarkTex = createStoneTextures(renderer, false, '#4B4563');

export const SQ_SIZE = 1.35;

// White Marble Faction Materials
export const MAT_MARBLE_BODY = new THREE.MeshPhysicalMaterial({
  color: 0xDFD7C8,
  map: marbleTex.map,
  bumpMap: marbleTex.bumpMap,
  bumpScale: 0.012,
  roughness: 0.28,
  metalness: 0.06,
  clearcoat: 0.42,
  clearcoatRoughness: 0.22,
  envMapIntensity: 0.72
});

export const MAT_MARBLE_BRONZE = new THREE.MeshStandardMaterial({
  color: 0xC89B3C,
  roughness: 0.26,
  metalness: 0.88,
  emissive: 0x261A04,
  emissiveIntensity: 0.25,
  envMapIntensity: 1.35
});

export const MAT_MARBLE_TRIM = new THREE.MeshStandardMaterial({
  color: 0x4A4356,
  roughness: 0.38,
  metalness: 0.65
});

// Black Obsidian Faction Materials
export const MAT_OBSIDIAN_BODY = new THREE.MeshPhysicalMaterial({
  color: 0x1B1828,
  map: obsidianTex.map,
  bumpMap: obsidianTex.bumpMap,
  bumpScale: 0.012,
  roughness: 0.16,
  metalness: 0.28,
  clearcoat: 0.85,
  clearcoatRoughness: 0.12,
  envMapIntensity: 1.55
});

export const MAT_OBSIDIAN_CRIMSON = new THREE.MeshStandardMaterial({
  color: 0xFF3352,
  roughness: 0.24,
  metalness: 0.82,
  emissive: 0x9E0E28,
  emissiveIntensity: 0.58,
  envMapIntensity: 1.4
});

export const MAT_OBSIDIAN_TRIM = new THREE.MeshStandardMaterial({
  color: 0x2E2942,
  roughness: 0.30,
  metalness: 0.80
});

// Board Tiles
export const MAT_TILE_LIGHT = new THREE.MeshPhysicalMaterial({
  color: 0xFFFFFF,
  map: tileLightTex.map,
  bumpMap: tileLightTex.bumpMap,
  bumpScale: 0.012,
  roughness: 0.42,
  metalness: 0.0,
  clearcoat: 0.12,
  clearcoatRoughness: 0.4,
  envMapIntensity: 0.45
});

export const MAT_TILE_DARK = new THREE.MeshPhysicalMaterial({
  color: 0xFFFFFF,
  map: tileDarkTex.map,
  bumpMap: tileDarkTex.bumpMap,
  bumpScale: 0.015,
  roughness: 0.38,
  metalness: 0.05,
  clearcoat: 0.15,
  clearcoatRoughness: 0.4,
  envMapIntensity: 0.45
});
