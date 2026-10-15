// Shared geometry/material caches: identical primitives are built once, so rebuilding pieces and
// markers never leaks GPU buffers. (Keyed by constructor reference: minified builds mangle .name.)
const _geoCache = new Map();
function cg(Ctor, ...args) {
  let byArgs = _geoCache.get(Ctor);
  if (!byArgs) { byArgs = new Map(); _geoCache.set(Ctor, byArgs); }
  const key = args.join(',');
  let g = byArgs.get(key);
  if (!g) { g = new Ctor(...args); byArgs.set(key, g); }
  return g;
}
const _matCache = new Map();
function cmat(opts) {
  const key = Object.entries(opts).map(([k, v]) => k + '=' + v).join('|');
  let m = _matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial(opts); _matCache.set(key, m); }
  return m;
}

// ============================================================================
// SYNTHESIZED CATHEDRAL WEB AUDIO ACOUSTICS
// ============================================================================
class CathedralAudio {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  playSelect() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.09);
  }
  playSlide() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.32);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.24;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(175, now);
    filter.frequency.linearRampToValueAtTime(115, now + 0.32);
    filter.Q.value = 3.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.30, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(now);
  }
  playShatter() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.45);
    oGain.gain.setValueAtTime(0.85, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(oGain).connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.46);

    for (let i = 0; i < 6; i++) {
      const delay = i * 0.032 + Math.random() * 0.018;
      const bSize = Math.floor(this.ctx.sampleRate * 0.14);
      const buf = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let j = 0; j < bSize; j++) ch[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bSize * 0.28));
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 950 + i * 340;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.34, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);
      src.connect(bp).connect(g).connect(this.ctx.destination);
      src.start(now + delay);
    }
  }
}
const sfx = new CathedralAudio();

// ============================================================================
// THREE.JS RENDERER & BALANCED EXPOSURE (NO WHITE BLOWOUT)
// ============================================================================
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92; // Balanced to preserve marble shading contours
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09080F);
scene.fog = new THREE.FogExp2(0x09080F, 0.008);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 120);

function buildCathedralHDRI() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0A0912);

  const moonStrip = new THREE.Mesh(
    cg(THREE.PlaneGeometry, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0x7A92D4, side: THREE.DoubleSide })
  );
  moonStrip.position.set(0, 15, 0);
  moonStrip.rotation.x = Math.PI / 2;
  envScene.add(moonStrip);

  const warmMat = new THREE.MeshBasicMaterial({ color: 0xE58A2E, side: THREE.DoubleSide });
  [[-12, 4, -12], [12, 4, -12], [-12, 4, 12], [12, 4, 12]].forEach(([x, y, z]) => {
    const p = new THREE.Mesh(cg(THREE.SphereGeometry, 2.0, 12, 12), warmMat);
    p.position.set(x, y, z);
    envScene.add(p);
  });

  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return envTex;
}
scene.environment = buildCathedralHDRI();

// ============================================================================
// PROCEDURAL MARBLE & OBSIDIAN TEXTURES + MULTI-TONE ARMOR MATERIALS
// ============================================================================
function createStoneTextures(isMarble, base) {
  const size = 512;
  const colCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colCanvas.width = bumpCanvas.width = size;
  colCanvas.height = bumpCanvas.height = size;
  const cCtx = colCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = base || (isMarble ? '#DDD5C7' : '#181523');
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < (isMarble ? 36 : 42); i++) {
    cCtx.beginPath(); bCtx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    cCtx.moveTo(x, y); bCtx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (Math.random() - 0.5) * 90;
      y += (Math.random() - 0.5) * 90;
      cCtx.lineTo(x, y); bCtx.lineTo(x, y);
    }
    cCtx.strokeStyle = isMarble
      ? `rgba(120, 110, 98, ${0.12 + Math.random() * 0.16})`
      : `rgba(80, 70, 115, ${0.12 + Math.random() * 0.16})`;
    cCtx.lineWidth = 1.2 + Math.random() * 2.5;
    cCtx.stroke();

    bCtx.strokeStyle = isMarble ? 'rgba(50,50,50,0.32)' : 'rgba(210,210,210,0.28)';
    bCtx.lineWidth = 1.6;
    bCtx.stroke();
  }

  cCtx.strokeStyle = isMarble ? 'rgba(150,140,125,0.55)' : 'rgba(95,82,135,0.35)';
  cCtx.lineWidth = 5;
  cCtx.strokeRect(2, 2, size - 4, size - 4);

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const map = new THREE.CanvasTexture(colCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  map.encoding = THREE.sRGBEncoding; // colour data is sRGB; bump data stays linear
  map.anisotropy = bumpMap.anisotropy = aniso;
  return { map, bumpMap };
}

const marbleTex = createStoneTextures(true);
const obsidianTex = createStoneTextures(false);
// Board tiles get their own textures: the colour lives in the texture (material colour stays white),
// so squares are not darkened by multiplying two dark values together.
const tileLightTex = createStoneTextures(true, '#E6DECF');
const tileDarkTex = createStoneTextures(false, '#4B4563');

// White Marble Faction Materials (Warm Ivory + Aged Bronze Armor + Dark Slate Visor Trim)
const MAT_MARBLE_BODY = new THREE.MeshPhysicalMaterial({
  color: 0xDFD7C8,
  map: marbleTex.map,
  bumpMap: marbleTex.bumpMap,
  bumpScale: 0.012,
  roughness: 0.28,
  metalness: 0.06,
  clearcoat: 0.42,
  clearcoatRoughness: 0.22,
  envMapIntensity: 0.72,
});

const MAT_MARBLE_BRONZE = new THREE.MeshStandardMaterial({
  color: 0xC89B3C,
  roughness: 0.26,
  metalness: 0.88,
  emissive: 0x261A04,
  emissiveIntensity: 0.25,
  envMapIntensity: 1.35,
});

const MAT_MARBLE_TRIM = new THREE.MeshStandardMaterial({
  color: 0x4A4356,
  roughness: 0.38,
  metalness: 0.65,
});

// Black Obsidian Faction Materials (Volcanic Glass + Crimson Runic Gold + Dark Iron Trim)
const MAT_OBSIDIAN_BODY = new THREE.MeshPhysicalMaterial({
  color: 0x1B1828,
  map: obsidianTex.map,
  bumpMap: obsidianTex.bumpMap,
  bumpScale: 0.012,
  roughness: 0.16,
  metalness: 0.28,
  clearcoat: 0.85,
  clearcoatRoughness: 0.12,
  envMapIntensity: 1.55,
});

const MAT_OBSIDIAN_CRIMSON = new THREE.MeshStandardMaterial({
  color: 0xFF3352,
  roughness: 0.24,
  metalness: 0.82,
  emissive: 0x9E0E28,
  emissiveIntensity: 0.58,
  envMapIntensity: 1.4,
});

const MAT_OBSIDIAN_TRIM = new THREE.MeshStandardMaterial({
  color: 0x2E2942,
  roughness: 0.30,
  metalness: 0.80,
});

// ============================================================================
// GOTHIC CATHEDRAL ARCHITECTURE & WROUGHT-IRON TRIPOD BRAZIERS
// ============================================================================
let sunLight = null;
const SQ_SIZE = 1.35;
const brazierLights = [];
const flameCones = [];

function buildCathedral() {
  const cath = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0x8899EE, 0x161222, 0.42);
  scene.add(hemi);

  const dirLight = sunLight = new THREE.DirectionalLight(0xE6ECFF, 1.05);
  dirLight.position.set(12, 24, 13);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 4096;
  dirLight.shadow.mapSize.height = 4096;
  dirLight.shadow.camera.near = 2;
  dirLight.shadow.camera.far = 55;
  const d = 10.2;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0003;
  scene.add(dirLight);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x171421, bumpMap: obsidianTex.bumpMap, bumpScale: 0.02, roughness: 0.48, metalness: 0.15
  });
  const floor = new THREE.Mesh(cg(THREE.BoxGeometry, 64, 0.6, 64), stoneMat);
  floor.position.y = -0.75;
  floor.receiveShadow = true;
  cath.add(floor);

  // Octagonal Stepped Sanctuary Dais
  const dais1 = new THREE.Mesh(cg(THREE.BoxGeometry, 14.0, 0.32, 14.0), stoneMat);
  dais1.position.y = -0.32;
  dais1.receiveShadow = true;
  cath.add(dais1);

  // Carved Board Border Frame with Algebraic Coordinate Plates
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x1B1726, roughness: 0.28, metalness: 0.35, clearcoat: 0.45
  });
  const frameOuter = new THREE.Mesh(cg(THREE.BoxGeometry, SQ_SIZE * 8 + 1.25, 0.24, SQ_SIZE * 8 + 1.25), frameMat);
  frameOuter.position.y = -0.14;   // top at -0.02
  frameOuter.receiveShadow = true;
  cath.add(frameOuter);

  const goldTrim = new THREE.Mesh(cg(THREE.BoxGeometry, SQ_SIZE * 8 + 0.16, 0.26, SQ_SIZE * 8 + 0.16), MAT_MARBLE_BRONZE);
  goldTrim.position.y = -0.138;   // top at -0.008, safely under the tiles (top at 0)
  cath.add(goldTrim);

  // Gothic Clustered Columns & Vault Arches
  const colPts = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.95, 0), new THREE.Vector2(0.95, 0.6),
    new THREE.Vector2(0.68, 1.1), new THREE.Vector2(0.55, 1.6), new THREE.Vector2(0.52, 13.5),
    new THREE.Vector2(0.75, 14.1), new THREE.Vector2(1.0, 14.7), new THREE.Vector2(0, 14.7)
  ];
  const colGeo = new THREE.LatheGeometry(colPts, 24);
  const colMat = new THREE.MeshStandardMaterial({ color: 0x242033, roughness: 0.55, metalness: 0.18 });

  [-15, -7.5, 0, 7.5, 15].forEach(z => {
    [-1, 1].forEach(side => {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(side * 13.5, -0.45, z);
      col.castShadow = true; col.receiveShadow = true;
      cath.add(col);
    });
  });

  // Wrought-Iron Gothic Tripod Braziers (Fixes the "Egg" Spheres)
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1F1C29, roughness: 0.4, metalness: 0.85 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xFF4500 });

  [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]].forEach(([bx, bz], idx) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, -0.35, bz);

    // Pedestal & Iron Fire Bowl
    const base = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.55, 0.72, 0.35, 8), colMat);
    base.position.y = 0.18;
    bGroup.add(base);

    // 3 Wrought-Iron Tripod Legs
    for (let l = 0; l < 3; l++) {
      const ang = (l * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.06, 0.08, 1.35, 8), ironMat);
      leg.position.set(Math.cos(ang) * 0.32, 0.75, Math.sin(ang) * 0.32);
      leg.rotation.z = Math.cos(ang) * 0.18;
      leg.rotation.x = -Math.sin(ang) * 0.18;
      leg.castShadow = true;
      bGroup.add(leg);
    }

    // Iron Fire Basket & Glowing Coals
    const bowl = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.62, 0.32, 0.42, 12), ironMat);
    bowl.position.y = 1.32;
    bowl.castShadow = true;
    bGroup.add(bowl);

    const cageRing = new THREE.Mesh(cg(THREE.TorusGeometry, 0.62, 0.04, 8, 18), MAT_MARBLE_BRONZE);
    cageRing.rotation.x = Math.PI / 2;
    cageRing.position.y = 1.52;
    bGroup.add(cageRing);

    const coals = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.52, 0.45, 0.12, 12), emberMat);
    coals.position.y = 1.48;
    bGroup.add(coals);

    // Multi-Tongue Sculpted Fire Cones (No Giant Grey Sphere)
    const tongues = [];
    for (let t = 0; t < 5; t++) {
      const isCore = t === 0;
      const tMat = new THREE.MeshBasicMaterial({
        color: isCore ? 0xFFF099 : (t % 2 === 0 ? 0xFF9922 : 0xFF4411),
        transparent: true, opacity: isCore ? 0.95 : 0.78,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const cone = new THREE.Mesh(cg(THREE.ConeGeometry, isCore ? 0.24 : 0.18, isCore ? 0.85 : 0.65, 10), tMat);
      const rad = isCore ? 0 : 0.16;
      const a = t * 1.5;
      cone.position.set(Math.cos(a) * rad, 1.82, Math.sin(a) * rad);
      bGroup.add(cone);
      tongues.push({ mesh: cone, baseH: isCore ? 0.85 : 0.65, phase: idx * 2.1 + t * 1.3 });
    }
    flameCones.push(...tongues);

    const pLight = new THREE.PointLight(0xFF8C32, 0.92, 19, 1.8);
    pLight.position.set(0, 2.2, 0);
    bGroup.add(pLight);
    brazierLights.push({ light: pLight, phase: idx * 1.7 });

    cath.add(bGroup);
  });

  scene.add(cath);
}
buildCathedral();

// ============================================================================
// FIGURATIVE GOTHIC SCULPTED CHESS PIECES (WITH MULTI-MATERIAL ARMOR CONTRAST)
// ============================================================================
function vec2List(pairs) {
  return pairs.map(([r, y]) => new THREE.Vector2(r, y));
}

// Octagonal Molded Pedestal (16 segments for crisp Gothic architectural facets)
const GEO_PEDESTAL = new THREE.LatheGeometry(vec2List([
  [0, 0], [0.49, 0], [0.49, 0.07], [0.44, 0.13],
  [0.37, 0.17], [0.41, 0.22], [0.32, 0.28], [0.29, 0.34], [0, 0.34]
]), 16);

const GEO_COLLAR = cg(THREE.TorusGeometry, 0.30, 0.035, 12, 24);
GEO_COLLAR.rotateX(Math.PI / 2);

const GEO_PAWN_TORSO = new THREE.LatheGeometry(vec2List([
  [0.29, 0.34], [0.26, 0.50], [0.20, 0.72], [0.25, 0.88], [0.16, 0.96], [0, 0.96]
]), 16);

const GEO_ROOK_TOWER = new THREE.LatheGeometry(vec2List([
  [0.34, 0.34], [0.31, 0.65], [0.28, 1.05], [0.33, 1.15],
  [0.37, 1.24], [0.37, 1.46], [0.24, 1.46], [0.24, 1.28], [0, 1.28]
]), 8); // Octagonal fortress tower

const GEO_BISHOP_ROBE = new THREE.LatheGeometry(vec2List([
  [0.31, 0.34], [0.27, 0.65], [0.21, 0.98], [0.25, 1.16],
  [0.19, 1.24], [0.15, 1.32], [0, 1.32]
]), 16);

const GEO_QUEEN_GOWN = new THREE.LatheGeometry(vec2List([
  [0.34, 0.34], [0.28, 0.68], [0.20, 1.04], [0.18, 1.24],
  [0.27, 1.38], [0.21, 1.48], [0.17, 1.56], [0, 1.56]
]), 24);

const GEO_KING_MANTLE = new THREE.LatheGeometry(vec2List([
  [0.36, 0.34], [0.31, 0.72], [0.25, 1.12], [0.31, 1.34],
  [0.24, 1.48], [0.20, 1.58], [0, 1.58]
]), 16);

function createKnightSculptGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.22, 0.0);
  shape.lineTo(0.20, 0.0);
  shape.bezierCurveTo(0.28, 0.22, 0.26, 0.52, 0.16, 0.76);
  shape.lineTo(0.38, 0.64);
  shape.bezierCurveTo(0.42, 0.70, 0.38, 0.84, 0.22, 0.95);
  shape.lineTo(0.12, 1.16);
  shape.lineTo(0.03, 1.03);
  shape.bezierCurveTo(-0.18, 0.98, -0.30, 0.72, -0.26, 0.35);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.24, bevelEnabled: true, bevelSegments: 4, steps: 2, bevelSize: 0.05, bevelThickness: 0.05
  });
  geo.center();
  geo.rotateY(Math.PI / 2);
  return geo;
}
const GEO_KNIGHT_SCULPT = createKnightSculptGeo();

function buildPieceMesh(type, colorChar) {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const headGroup = new THREE.Group();
  const weaponGroup = new THREE.Group();
  root.add(bodyGroup);
  bodyGroup.add(headGroup);
  bodyGroup.add(weaponGroup);

  const mainMat = colorChar === 'w' ? MAT_MARBLE_BODY : MAT_OBSIDIAN_BODY;
  const accMat  = colorChar === 'w' ? MAT_MARBLE_BRONZE : MAT_OBSIDIAN_CRIMSON;
  const trimMat = colorChar === 'w' ? MAT_MARBLE_TRIM : MAT_OBSIDIAN_TRIM;

  // Base Pedestal + Bronze/Crimson Collar + Dark Trim Ring
  const ped = new THREE.Mesh(GEO_PEDESTAL, mainMat);
  ped.castShadow = true; ped.receiveShadow = true;
  bodyGroup.add(ped);

  const trimBase = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.46, 0.48, 0.04, 16), trimMat);
  trimBase.position.y = 0.09;
  bodyGroup.add(trimBase);

  const collar = new THREE.Mesh(GEO_COLLAR, accMat);
  collar.position.y = 0.34;
  bodyGroup.add(collar);

  if (type === 'p') {
    // ARMORED FOOTMAN PAWN: Surcoat, Pauldrons, Visored Helm, Kite Shield & Broadsword
    const torso = new THREE.Mesh(GEO_PAWN_TORSO, mainMat);
    torso.castShadow = true; torso.receiveShadow = true;
    bodyGroup.add(torso);

    // Shoulder Pauldrons & Belt
    const belt = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.22, 0.22, 0.06, 16), trimMat);
    belt.position.y = 0.64;
    bodyGroup.add(belt);
    [-1, 1].forEach(s => {
      const pauldron = new THREE.Mesh(cg(THREE.SphereGeometry, 0.13, 16, 16), accMat);
      pauldron.scale.set(1.1, 0.75, 1.2);
      pauldron.position.set(s * 0.22, 0.88, 0);
      bodyGroup.add(pauldron);
    });

    // Visored Crusader Helmet
    headGroup.position.y = 1.08;
    const helm = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.15, 0.17, 0.26, 16), mainMat);
    helm.castShadow = true;
    const dome = new THREE.Mesh(cg(THREE.SphereGeometry, 0.15, 16, 16), mainMat);
    dome.position.y = 0.13;
    // Dark Visor Faceplate with Eye Slit
    const visor = new THREE.Mesh(cg(THREE.BoxGeometry, 0.22, 0.10, 0.14), trimMat);
    visor.position.set(0, 0.02, 0.11);
    const crest = new THREE.Mesh(cg(THREE.BoxGeometry, 0.04, 0.14, 0.24), accMat);
    crest.position.set(0, 0.22, 0);
    headGroup.add(helm, dome, visor, crest);

    // Front-Mounted Kite Shield + Upright Sword
    weaponGroup.position.set(0, 0.68, 0.26);
    const shield = new THREE.Mesh(cg(THREE.BoxGeometry, 0.28, 0.42, 0.05), trimMat);
    const shieldBoss = new THREE.Mesh(cg(THREE.BoxGeometry, 0.22, 0.34, 0.06), accMat);
    shield.castShadow = true;
    weaponGroup.add(shield, shieldBoss);

    const sword = new THREE.Mesh(cg(THREE.BoxGeometry, 0.04, 0.62, 0.07), accMat);
    sword.position.set(0.27, 0.12, -0.08);
    weaponGroup.add(sword);

  } else if (type === 'r') {
    // GOTHIC SIEGE TOWER ROOK: 4 Buttress Pillars, Crenellations & Arcane Core
    const tower = new THREE.Mesh(GEO_ROOK_TOWER, mainMat);
    tower.castShadow = true; tower.receiveShadow = true;
    bodyGroup.add(tower);

    // 4 Corner Armored Buttress Ribs
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const rib = new THREE.Mesh(cg(THREE.BoxGeometry, 0.09, 0.88, 0.12), trimMat);
      rib.position.set(Math.sin(a) * 0.29, 0.78, Math.cos(a) * 0.29);
      rib.rotation.y = a;
      rib.castShadow = true;
      bodyGroup.add(rib);
    }

    headGroup.position.y = 1.48;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const merlon = new THREE.Mesh(cg(THREE.BoxGeometry, 0.11, 0.18, 0.09), i % 2 === 0 ? mainMat : accMat);
      merlon.position.set(Math.sin(a) * 0.31, 0.04, Math.cos(a) * 0.31);
      merlon.rotation.y = a;
      merlon.castShadow = true;
      headGroup.add(merlon);
    }
    const crystal = new THREE.Mesh(cg(THREE.OctahedronGeometry, 0.16, 0), accMat);
    crystal.position.y = 0.08;
    headGroup.add(crystal);

  } else if (type === 'n') {
    // ARMORED WARHORSE KNIGHT: Sculpted Barding, Chamfron Faceplate, Mane & War-Lance
    const chestArmor = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.24, 0.29, 0.32, 16), trimMat);
    chestArmor.position.y = 0.48;
    bodyGroup.add(chestArmor);

    const horse = new THREE.Mesh(GEO_KNIGHT_SCULPT, mainMat);
    horse.position.set(0, 0.92, 0.02);
    horse.castShadow = true; horse.receiveShadow = true;
    headGroup.add(horse);

    // Armored Chamfron Nose Plate & Segmented Mane Blades
    const chamfron = new THREE.Mesh(cg(THREE.BoxGeometry, 0.14, 0.36, 0.06), accMat);
    chamfron.position.set(0, 1.12, 0.24);
    chamfron.rotation.x = -0.58;
    headGroup.add(chamfron);

    for (let m = 0; m < 5; m++) {
      const manePlate = new THREE.Mesh(cg(THREE.BoxGeometry, 0.06, 0.14, 0.16), m % 2 === 0 ? accMat : trimMat);
      manePlate.position.set(0, 0.65 + m * 0.15, -0.18 - m * 0.01);
      manePlate.rotation.x = -0.35;
      headGroup.add(manePlate);
    }

    weaponGroup.position.set(0.30, 0.86, 0.16);
    const lance = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.015, 0.04, 1.28, 12), accMat);
    lance.rotation.x = 0.85;
    const guard = new THREE.Mesh(cg(THREE.ConeGeometry, 0.09, 0.16, 12), trimMat);
    guard.rotation.x = 0.85;
    weaponGroup.add(lance, guard);

  } else if (type === 'b') {
    // HIGH INQUISITOR BISHOP: Fluted Vestments, Stole, Split Two-Peak Mitre & Crosier
    const robe = new THREE.Mesh(GEO_BISHOP_ROBE, mainMat);
    robe.castShadow = true; robe.receiveShadow = true;
    bodyGroup.add(robe);

    // Ornate Liturgical Stole
    const stole = new THREE.Mesh(cg(THREE.BoxGeometry, 0.12, 0.78, 0.44), trimMat);
    stole.position.y = 0.78;
    const stoleCross = new THREE.Mesh(cg(THREE.BoxGeometry, 0.06, 0.74, 0.46), accMat);
    stoleCross.position.y = 0.78;
    bodyGroup.add(stole, stoleCross);

    // Authentic Split Two-Peak Bishop Mitre
    headGroup.position.y = 1.34;
    const visHead = new THREE.Mesh(cg(THREE.SphereGeometry, 0.15, 16, 16), trimMat);
    headGroup.add(visHead);

    const frontPeak = new THREE.Mesh(cg(THREE.ConeGeometry, 0.16, 0.38, 16), mainMat);
    frontPeak.scale.set(1.0, 1.0, 0.55);
    frontPeak.position.set(0, 0.24, 0.06);
    frontPeak.rotation.x = -0.12;

    const backPeak = new THREE.Mesh(cg(THREE.ConeGeometry, 0.16, 0.38, 16), mainMat);
    backPeak.scale.set(1.0, 1.0, 0.55);
    backPeak.position.set(0, 0.24, -0.06);
    backPeak.rotation.x = 0.12;

    const mitreBand = new THREE.Mesh(cg(THREE.TorusGeometry, 0.15, 0.025, 10, 20), accMat);
    mitreBand.rotation.x = Math.PI / 2;
    mitreBand.position.y = 0.08;
    headGroup.add(frontPeak, backPeak, mitreBand);

    // Ornate Crosier Staff
    weaponGroup.position.set(0.28, 0.92, 0.14);
    const staff = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.024, 0.024, 1.24, 12), accMat);
    const halo = new THREE.Mesh(cg(THREE.TorusGeometry, 0.11, 0.024, 12, 24), accMat);
    halo.position.y = 0.65;
    const gem = new THREE.Mesh(cg(THREE.OctahedronGeometry, 0.06, 0), trimMat);
    gem.position.y = 0.65;
    weaponGroup.add(staff, halo, gem);

  } else if (type === 'q') {
    // SOVEREIGN SORCERESS QUEEN: Buttressed Gown, High Collar, 8-Spike Crown & Scepter
    const gown = new THREE.Mesh(GEO_QUEEN_GOWN, mainMat);
    gown.castShadow = true; gown.receiveShadow = true;
    bodyGroup.add(gown);

    // 6 Bronze/Crimson Dress Ribs for High Contrast
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const rib = new THREE.Mesh(cg(THREE.BoxGeometry, 0.04, 0.85, 0.08), accMat);
      rib.position.set(Math.sin(a) * 0.22, 0.80, Math.cos(a) * 0.22);
      rib.rotation.y = a;
      bodyGroup.add(rib);
    }

    headGroup.position.y = 1.58;
    const headSphere = new THREE.Mesh(cg(THREE.SphereGeometry, 0.16, 20, 20), mainMat);
    const crownBand = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.19, 0.16, 0.12, 20), trimMat);
    crownBand.position.y = 0.12;
    headGroup.add(headSphere, crownBand);

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const spike = new THREE.Mesh(cg(THREE.ConeGeometry, 0.035, 0.24, 10), accMat);
      spike.position.set(Math.cos(a) * 0.18, 0.24, Math.sin(a) * 0.18);
      spike.rotation.z = -Math.cos(a) * 0.25;
      spike.rotation.x = -Math.sin(a) * 0.25;
      headGroup.add(spike);
    }

    weaponGroup.position.set(0.31, 0.98, 0.16);
    const scepter = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.025, 0.02, 1.32, 12), accMat);
    const ring1 = new THREE.Mesh(cg(THREE.TorusGeometry, 0.10, 0.018, 10, 24), accMat);
    ring1.position.y = 0.68;
    const ring2 = new THREE.Mesh(cg(THREE.TorusGeometry, 0.10, 0.018, 10, 24), trimMat);
    ring2.position.y = 0.68; ring2.rotation.y = Math.PI / 2;
    weaponGroup.add(scepter, ring1, ring2);

  } else if (type === 'k') {
    // GRAND MONARCH KING: Plated Royal Mantle, Imperial Arched Crown & Planted Greatsword
    const mantle = new THREE.Mesh(GEO_KING_MANTLE, mainMat);
    mantle.castShadow = true; mantle.receiveShadow = true;
    bodyGroup.add(mantle);

    // Armored Breastplate & Shoulder Mantle Trim
    const breastplate = new THREE.Mesh(cg(THREE.BoxGeometry, 0.36, 0.68, 0.32), trimMat);
    breastplate.position.y = 1.05;
    const baldric = new THREE.Mesh(cg(THREE.BoxGeometry, 0.38, 0.12, 0.34), accMat);
    baldric.position.y = 1.24;
    bodyGroup.add(breastplate, baldric);

    headGroup.position.y = 1.62;
    const helm = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.17, 0.17, 0.24, 16), mainMat);
    const visor = new THREE.Mesh(cg(THREE.BoxGeometry, 0.22, 0.10, 0.14), trimMat);
    visor.position.set(0, 0.0, 0.11);
    const crown = new THREE.Mesh(cg(THREE.CylinderGeometry, 0.22, 0.18, 0.16, 16), accMat);
    crown.position.y = 0.16;

    const crossV = new THREE.Mesh(cg(THREE.BoxGeometry, 0.07, 0.30, 0.07), accMat);
    crossV.position.y = 0.36;
    const crossH = new THREE.Mesh(cg(THREE.BoxGeometry, 0.22, 0.07, 0.07), accMat);
    crossH.position.y = 0.40;
    headGroup.add(helm, visor, crown, crossV, crossH);

    // Classic Wizard's Chess Two-Handed Greatsword Planted in Front
    weaponGroup.position.set(0, 0.78, 0.31);
    const blade = new THREE.Mesh(cg(THREE.BoxGeometry, 0.08, 1.18, 0.03), accMat);
    const fuller = new THREE.Mesh(cg(THREE.BoxGeometry, 0.03, 1.05, 0.04), trimMat);
    const crossguard = new THREE.Mesh(cg(THREE.BoxGeometry, 0.38, 0.055, 0.08), accMat);
    crossguard.position.y = 0.42;
    const pommel = new THREE.Mesh(cg(THREE.SphereGeometry, 0.055, 12, 12), accMat);
    pommel.position.y = 0.64;
    weaponGroup.add(blade, fuller, crossguard, pommel);
  }

  root.rotation.y = colorChar === 'w' ? Math.PI : 0;
  root.userData = { bodyGroup, headGroup, weaponGroup, phase: Math.random() * Math.PI * 2, type, colorChar };
  return root;
}

// ============================================================================
// 64-SQUARE BOARD & HIGH-CONTRAST 3D TACTICAL MOVE MARKERS (FIXES WHITE SQUARES)
// ============================================================================
const game = new Chess();
const squareMeshes = {};
const pieceMeshes = {};
const shards = [];
let selectedSq = null;
let validMoves = [];
let lastMove = null;
let hintMove = null;
let hoveredSq = null;
let aiDepth = 2;
let humanColor = 'w';
let gen = 0;            // bumped whenever the position changes behind the AI's back (undo / reset)
let aiPendingGen = -1;  // generation the in-flight AI request belongs to
let promoPiece = 'q';
let isAnimating = false;
let activeAnim = null;

const MAT_TILE_LIGHT = new THREE.MeshPhysicalMaterial({
  color: 0xFFFFFF, map: tileLightTex.map, bumpMap: tileLightTex.bumpMap, bumpScale: 0.012,
  roughness: 0.42, metalness: 0.0, clearcoat: 0.12, clearcoatRoughness: 0.4, envMapIntensity: 0.45
});
const MAT_TILE_DARK = new THREE.MeshPhysicalMaterial({
  color: 0xFFFFFF, map: tileDarkTex.map, bumpMap: tileDarkTex.bumpMap, bumpScale: 0.015,
  roughness: 0.38, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.45
});

function sqToWorld(sqName) {
  const file = sqName.charCodeAt(0) - 97;
  const rank = parseInt(sqName[1], 10) - 1;
  return new THREE.Vector3((file - 3.5) * SQ_SIZE, 0, (3.5 - rank) * SQ_SIZE);
}

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const markerGroup = new THREE.Group();
scene.add(markerGroup);

// Live 3D Hover Cursor Ring
const hoverCursor = new THREE.Group();
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

const files = ['a','b','c','d','e','f','g','h'];
for (let r = 1; r <= 8; r++) {
  for (let f = 0; f < 8; f++) {
    const sq = files[f] + r;
    const isLight = (f + r) % 2 === 0; // a1 (f=0, r=1) is dark; each player's right-hand corner is light
    const mat = (isLight ? MAT_TILE_LIGHT : MAT_TILE_DARK).clone();
    const tile = new THREE.Mesh(cg(THREE.BoxGeometry, SQ_SIZE * 0.994, 0.14, SQ_SIZE * 0.994), mat);
    const pos = sqToWorld(sq);
    tile.position.set(pos.x, -0.07, pos.z);
    tile.receiveShadow = true;
    tile.userData = { sq, isLight, baseHex: mat.color.getHex() };
    boardGroup.add(tile);
    squareMeshes[sq] = tile;
  }
}

// Build 3D High-Contrast Tactical Reticles on Valid Squares (100% visible on White & Black tiles)
const animatedMarkers = [];

// Tile highlights are additive (emissive), so they read the same on light and dark squares
// instead of being multiplied into the (dark) albedo.
function tintTile(tile, hex, strength) {
  tile.material.emissive.setHex(hex);
  tile.material.emissiveIntensity = strength * (tile.userData.isLight ? 0.55 : 1.0);
}

function rebuildTacticalMarkers() {
  while (markerGroup.children.length > 0) {
    markerGroup.remove(markerGroup.children[0]);
  }
  animatedMarkers.length = 0;

  // Reset tile colors first
  for (const sq in squareMeshes) {
    const tile = squareMeshes[sq];
    tile.material.emissive.setHex(0x000000);
    tile.material.emissiveIntensity = 1;
  }

  // 1. Last Move Trail
  if (lastMove) {
    [lastMove.from, lastMove.to].forEach(sq => {
      const tile = squareMeshes[sq];
      tintTile(tile, 0xC9962E, 0.55);
    });
  }

  // 2. Tactical Hint Highlight
  if (hintMove) {
    [hintMove.from, hintMove.to].forEach(sq => {
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
  if (selectedSq) {
    const tile = squareMeshes[selectedSq];
    tintTile(tile, 0x8A5CFF, 0.7);
    const pos = sqToWorld(selectedSq);
    const selRing = new THREE.Mesh(
      cg(THREE.RingGeometry, 0.46, 0.58, 32),
      cmat({ color: 0xD0BCFF, side: THREE.DoubleSide })
    );
    selRing.rotation.x = Math.PI / 2;
    selRing.position.set(pos.x, 0.018, pos.z);
    markerGroup.add(selRing);
  }

  // 4. Valid Destination Squares (Dual-Contrast Obsidian Outline + Glowing Core + 3D Pip)
  validMoves.forEach(vm => {
    const tile = squareMeshes[vm.to];
    const pos = sqToWorld(vm.to);
    const g = new THREE.Group();
    g.position.set(pos.x, 0.018, pos.z);

    if (vm.captured) {
      // CAPTURE TARGET: High-Contrast Crimson Tile Tint + Dark Rim + Pulsing Target Ring
      tintTile(tile, 0xE02344, 0.8);

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
      animatedMarkers.push({ mesh: oct, type: 'capture' });
    } else {
      // QUIET MOVE: Emerald Tile Tint + Dark Obsidian Contrast Ring + Bright Emerald Core + 3D Diamond Pip
      tintTile(tile, 0x12C87A, 0.6);

      // Dark outer border ensures 100% visibility on bright white squares
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
      animatedMarkers.push({ mesh: pip, type: 'quiet' });
    }

    markerGroup.add(g);
  });

  // 5. King in Check Crimson Beacon
  if (game.in_check()) {
    const turnColor = game.turn();
    for (const sq in pieceMeshes) {
      const pm = pieceMeshes[sq];
      if (pm.userData.type === 'k' && pm.userData.colorChar === turnColor) {
        tintTile(squareMeshes[sq], 0xFF1F3F, 1.0);
      }
    }
  }
}

function syncBoardFull() {
  Object.values(pieceMeshes).forEach(m => scene.remove(m));
  for (const k in pieceMeshes) delete pieceMeshes[k];

  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = files[f] + r;
      const p = game.get(sq);
      if (p) {
        const mesh = buildPieceMesh(p.type, p.color);
        mesh.position.copy(sqToWorld(sq));
        mesh.userData.sq = sq;
        scene.add(mesh);
        pieceMeshes[sq] = mesh;
      }
    }
  }
}
syncBoardFull();

function spawnShatter(worldPos, colorChar, impactDir) {
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
    shards.push({ mesh, vel, rotVel, baseScale, age: 0, life: 2.2 + Math.random() * 1.2 });
  }
}

// ============================================================================
// UNIFIED RAYCASTING (DETECTS BOTH 3D PIECES & BOARD TILES)
// ============================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function aiTurn() {
  return aiDepth > 0 && !game.game_over() && game.turn() !== humanColor;
}

function getSquareUnderPointer(clientX, clientY) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  let pieceSq = null;
  const pieceHits = raycaster.intersectObjects(Object.values(pieceMeshes), true);
  if (pieceHits.length > 0) {
    let obj = pieceHits[0].object;
    while (obj && !obj.userData.sq && obj.parent) obj = obj.parent;
    if (obj && obj.userData.sq) pieceSq = obj.userData.sq;
  }
  const tileHits = raycaster.intersectObjects(Object.values(squareMeshes), false);
  const tileSq = tileHits.length > 0 ? tileHits[0].object.userData.sq : null;

  if (pieceSq) {
    const p = game.get(pieceSq);
    const isDest = validMoves.some(m => m.to === pieceSq);
    const ownPiece = Boolean(p && p.color === game.turn());
    if (isDest || ownPiece) return pieceSq;
    // A tall piece that is neither capturable nor selectable must not swallow a click that is
    // really aimed at a highlighted destination square behind it.
    if (tileSq && validMoves.some(m => m.to === tileSq)) return tileSq;
    return pieceSq;
  }
  return tileSq;
}

const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

function clearHover() {
  hoveredSq = null;
  hoverCursor.visible = false;
  canvas.classList.remove('pointer-piece');
}

function updateHover(clientX, clientY) {
  const sq = getSquareUnderPointer(clientX, clientY);
  hoveredSq = sq;
  if (!sq) { clearHover(); return; }
  const pos = sqToWorld(sq);
  hoverCursor.position.set(pos.x, 0.014, pos.z);
  hoverCursor.visible = true;
  const p = game.get(sq);
  document.getElementById('hover-sq').textContent = `Square: ${sq.toUpperCase()}`;
  document.getElementById('hover-piece').textContent = p
    ? `${p.color === 'w' ? 'Marble' : 'Obsidian'} ${PIECE_NAMES[p.type]}`
    : 'Empty';
  canvas.classList.toggle('pointer-piece', Boolean((p && p.color === game.turn()) || validMoves.some(m => m.to === sq)));
}

// One pointer state machine: a short left click picks/moves, a left-drag (past a small threshold)
// or any right-drag orbits the camera. Pointer capture keeps the drag alive outside the window.
const DRAG_THRESHOLD = 6;
let pointerState = null;

function endPointer() {
  pointerState = null;
  isDraggingCam = false;
  canvas.style.cursor = '';
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 2) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  pointerState = {
    id: e.pointerId, button: e.button,
    startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
    orbiting: e.button === 2,
  };
  isDraggingCam = pointerState.orbiting;
  if (isDraggingCam) { clearHover(); canvas.style.cursor = 'grabbing'; }
});
canvas.addEventListener('pointermove', e => {
  const ps = pointerState;
  if (ps && ps.id === e.pointerId) {
    if (!ps.orbiting && Math.hypot(e.clientX - ps.startX, e.clientY - ps.startY) > DRAG_THRESHOLD) {
      ps.orbiting = true; isDraggingCam = true;
      clearHover(); canvas.style.cursor = 'grabbing';
    }
    if (ps.orbiting) {
      targetYaw -= (e.clientX - ps.lastX) * 0.007;
      targetPitch = Math.max(0.22, Math.min(1.42, targetPitch + (e.clientY - ps.lastY) * 0.006));
    }
    ps.lastX = e.clientX; ps.lastY = e.clientY;
    if (ps.orbiting) return;
  }
  updateHover(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e => {
  const ps = pointerState;
  if (!ps || ps.id !== e.pointerId) return;
  endPointer();
  if (ps.button === 0 && !ps.orbiting) onBoardClick(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', endPointer);
// Moving over the HUD panels must not drive the 3D hover cursor.
window.addEventListener('pointermove', e => {
  if (e.target !== canvas && !pointerState) clearHover();
});

function onBoardClick(clientX, clientY) {
  if (isAnimating || game.game_over() || aiTurn()) return;
  const sq = getSquareUnderPointer(clientX, clientY);
  if (sq) handleSquareClick(sq);
}

function handleSquareClick(sq) {
  hintMove = null;
  const vm = validMoves.find(m => m.to === sq);
  if (vm) {
    selectedSq = null;
    validMoves = [];
    rebuildTacticalMarkers();
    executeMoveAnimated(vm.from, vm.to, promoPiece);
    return;
  }

  const p = game.get(sq);
  if (p && p.color === game.turn()) {
    sfx.playSelect();
    selectedSq = sq;
    validMoves = game.moves({ square: sq, verbose: true });
    rebuildTacticalMarkers();
  } else {
    selectedSq = null;
    validMoves = [];
    rebuildTacticalMarkers();
  }
}

function executeMoveAnimated(fromSq, toSq, promotion = 'q') {
  const moveObj = game.move({ from: fromSq, to: toSq, promotion });
  if (!moveObj) return false;

  isAnimating = true;
  lastMove = moveObj;
  sfx.playSlide();

  const attacker = pieceMeshes[fromSq];
  const isCapture = Boolean(moveObj.captured);
  let capturedSq = toSq;
  if (moveObj.flags.includes('e')) {
    capturedSq = toSq[0] + fromSq[1];
  }
  const defender = isCapture ? pieceMeshes[capturedSq] : null;

  let rookAnim = null;
  if (moveObj.flags.includes('k') || moveObj.flags.includes('q')) {
    const rank = fromSq[1];
    const rFrom = moveObj.flags.includes('k') ? 'h' + rank : 'a' + rank;
    const rTo = moveObj.flags.includes('k') ? 'f' + rank : 'd' + rank;
    const rMesh = pieceMeshes[rFrom];
    if (rMesh) {
      delete pieceMeshes[rFrom];
      pieceMeshes[rTo] = rMesh;
      rMesh.userData.sq = rTo;
      rookAnim = { mesh: rMesh, start: sqToWorld(rFrom), end: sqToWorld(rTo) };
    }
  }

  activeAnim = {
    moveObj, attacker, defender, capturedSq,
    start: sqToWorld(fromSq), end: sqToWorld(toSq),
    isCapture, shattered: false, elapsed: 0,
    duration: isCapture ? 0.64 : 0.42, rookAnim
  };
  return true;
}

async function triggerAI() {
  if (!aiTurn() || isAnimating || aiPendingGen === gen) return;
  const myGen = gen;
  const fenAtStart = game.fen();
  aiPendingGen = myGen;
  document.getElementById('status-text').textContent =
    `${game.turn() === 'w' ? 'MARBLE ORDER' : 'OBSIDIAN GUARD'} PONDERING...`;

  let aiMove = null;
  try {
    if (window.pywebview && window.pywebview.api) {
      aiMove = await window.pywebview.api.compute_ai_move(fenAtStart, aiDepth);
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (aiPendingGen === myGen) aiPendingGen = -1;
  }

  // The position changed while the engine was thinking (undo / reset / mode switch): discard.
  if (myGen !== gen || game.fen() !== fenAtStart || !aiTurn()) { updateHUD(); return; }

  const legal = game.moves({ verbose: true });
  if (legal.length === 0) return;
  // Two rule engines are in play, so never trust the bridge blindly: confirm legality here.
  if (!aiMove || !legal.some(m => m.from === aiMove.from && m.to === aiMove.to)) {
    aiMove = legal[Math.floor(Math.random() * legal.length)];
  }
  executeMoveAnimated(aiMove.from, aiMove.to, aiMove.promotion || 'q');
}

async function showTacticalHint() {
  if (isAnimating || game.game_over() || aiTurn()) return;
  const myGen = gen;
  const fenAtStart = game.fen();
  let suggestion = null;
  try {
    if (window.pywebview && window.pywebview.api) {
      suggestion = await window.pywebview.api.compute_hint(fenAtStart);
    }
  } catch (e) { console.error(e); }
  if (myGen !== gen || game.fen() !== fenAtStart || isAnimating || aiTurn()) return;

  const legal = game.moves({ verbose: true });
  if (legal.length === 0) return;
  if (!suggestion || !legal.some(m => m.from === suggestion.from && m.to === suggestion.to)) {
    suggestion = legal[0];
  }
  hintMove = suggestion;
  selectedSq = suggestion.from;
  validMoves = game.moves({ square: suggestion.from, verbose: true });
  sfx.playSelect();
  rebuildTacticalMarkers();
}

// ============================================================================
// TELEMETRY, CAPTURED PIECES & MOVE LEDGER UPDATES
// ============================================================================
const SYMBOLS_W = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' };
const SYMBOLS_B = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const VALS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function updateHUD() {
  const statusEl = document.getElementById('status-text');
  const badgeEl = document.getElementById('turn-badge');
  const dotEl = document.getElementById('turn-dot');
  const modal = document.getElementById('end-modal');

  const isWhiteTurn = game.turn() === 'w';
  document.getElementById('card-white').classList.toggle('active-turn', isWhiteTurn);
  document.getElementById('card-black').classList.toggle('active-turn', !isWhiteTurn);
  badgeEl.classList.toggle('in-check', game.in_check());

  if (game.in_checkmate()) {
    const winner = isWhiteTurn ? 'OBSIDIAN GUARD' : 'MARBLE ORDER';
    statusEl.textContent = `CHECKMATE — ${winner} WINS`;
    document.getElementById('modal-title').textContent = 'CHECKMATE';
    document.getElementById('modal-sub').textContent = `The ${winner} triumphs in the Cathedral Sanctuary!`;
    modal.classList.add('visible');
  } else if (game.in_draw()) {
    let why = 'DRAW';
    let sub = 'Neither order could claim the sanctuary.';
    if (game.in_stalemate()) { why = 'DRAW BY STALEMATE'; sub = 'The side to move has no legal moves, yet is not in check.'; }
    else if (game.insufficient_material()) { why = 'DRAW BY INSUFFICIENT MATERIAL'; sub = 'Neither side has enough force to deliver checkmate.'; }
    else if (game.in_threefold_repetition()) { why = 'DRAW BY REPETITION'; sub = 'The same position occurred three times.'; }
    else { why = 'DRAW BY FIFTY-MOVE RULE'; sub = 'Fifty moves passed without a capture or pawn move.'; }
    statusEl.textContent = why;
    document.getElementById('modal-title').textContent = 'MATCH DRAWN';
    document.getElementById('modal-sub').textContent = sub;
    modal.classList.add('visible');
  } else {
    modal.classList.remove('visible');
    const side = isWhiteTurn ? 'MARBLE ORDER (WHITE)' : 'OBSIDIAN GUARD (BLACK)';
    const chk = game.in_check() ? ' • CHECK!' : '';
    statusEl.textContent = `${side}${chk}`;
    dotEl.style.background = isWhiteTurn ? '#F2C96D' : '#FF4D64';
  }

  // Material Advantage & Captured Trays
  const hist = game.history({ verbose: true });
  const capByWhite = [];
  const capByBlack = [];
  hist.forEach(m => {
    if (m.captured) {
      if (m.color === 'w') capByWhite.push(SYMBOLS_B[m.captured] || '');
      else capByBlack.push(SYMBOLS_W[m.captured] || '');
    }
  });
  document.getElementById('cap-white').textContent = capByWhite.length ? capByWhite.join(' ') : '—';
  document.getElementById('cap-black').textContent = capByBlack.length ? capByBlack.join(' ') : '—';

  let wMat = 0, bMat = 0;
  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = game.get(files[f] + r);
      if (p) {
        if (p.color === 'w') wMat += VALS[p.type];
        else bMat += VALS[p.type];
      }
    }
  }
  const diff = wMat - bMat;
  document.getElementById('adv-white').textContent = diff >= 0 ? `+${diff}` : `${diff}`;
  document.getElementById('adv-black').textContent = diff <= 0 ? `+${-diff}` : `${-diff}`;
  const pct = Math.max(10, Math.min(90, 50 + diff * 4));
  document.getElementById('eval-fill').style.width = `${pct}%`;

  // 2-Column Move Ledger
  const ledger = document.getElementById('ledger-list');
  document.getElementById('move-count').textContent = `Turn ${Math.floor(hist.length / 2) + 1}`;
  if (hist.length === 0) {
    ledger.innerHTML = '<div style="color:var(--md-muted); font-size:0.72rem;">Click any Marble piece or square to begin.</div>';
  } else {
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const wSan = hist[i].san;
      const bSan = hist[i + 1] ? hist[i + 1].san : '';
      html += `<div class="ledger-row"><span>${(i / 2) + 1}.</span><span>${wSan}</span><span>${bSan}</span></div>`;
    }
    ledger.innerHTML = html;
    ledger.scrollTop = ledger.scrollHeight;
  }
}

// ============================================================================
// CAMERA ORBIT CONTROLS, HOTKEYS & MAIN RENDER LOOP
// ============================================================================
let camYaw = 0, camPitch = 0.66, camDist = 15.6;
let targetYaw = 0, targetPitch = 0.66, targetDist = 15.6;
let isDraggingCam = false;
let shakeAmt = 0;

window.addEventListener('wheel', e => {
  targetDist = Math.max(8.5, Math.min(25.0, targetDist + e.deltaY * 0.008));
});

let resetArmedUntil = 0;
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); flipCamera(); }   // also stops a focused button from re-firing
  else if (k === '1') setCameraPreset(1);
  else if (k === '2') setCameraPreset(2);
  else if (k === '3') setCameraPreset(3);
  else if (k === 'z') undoMove();
  else if (k === 'h') showTacticalHint();
  else if (k === 'm') toggleAudio();
  else if (k === 'r') {
    // Reset wipes the game, so the hotkey needs a deliberate second press.
    const now = performance.now();
    if (game.history().length === 0 || now < resetArmedUntil) {
      resetArmedUntil = 0;
      resetGame();
    } else {
      resetArmedUntil = now + 1500;
      document.getElementById('status-text').textContent = 'PRESS R AGAIN TO RESET';
      setTimeout(() => { if (aiPendingGen !== gen) updateHUD(); }, 1500);
    }
  }
});
// Toolbar buttons must not keep keyboard focus, otherwise Space/Enter would re-trigger them.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button');
  if (b) b.blur();
});

function setCameraPreset(id) {
  if (id === 1) { targetYaw = 0; targetPitch = 0.66; targetDist = 15.6; }
  if (id === 2) { targetYaw = 0.62; targetPitch = 0.50; targetDist = 14.5; }
  if (id === 3) { targetYaw = 0; targetPitch = 1.44; targetDist = 17.2; }
}
function flipCamera() { targetYaw += Math.PI; }
function toggleAudio() {
  sfx.muted = !sfx.muted;
  document.getElementById('mute-btn').textContent = sfx.muted ? '🔇' : '🔊';
}
function clearSelection() {
  lastMove = null; selectedSq = null; validMoves = []; hintMove = null;
}
function undoMove() {
  if (isAnimating || game.history().length === 0) return;
  gen++;                       // invalidates any in-flight AI / hint result
  game.undo();
  if (aiDepth > 0 && game.turn() !== humanColor && game.history().length > 0) game.undo();
  clearSelection();
  syncBoardFull(); rebuildTacticalMarkers(); updateHUD();
  triggerAI();                 // no-op unless it is the AI's turn (e.g. you play Black)
}
function resetGame() {
  if (isAnimating) return;
  gen++;
  game.reset();
  clearSelection();
  syncBoardFull(); rebuildTacticalMarkers(); updateHUD();
  triggerAI();
}
function closeModal() {
  document.getElementById('end-modal').classList.remove('visible');
}
let shadowHigh = true;
function applyShadowQuality() {
  if (!sunLight) return;
  const size = shadowHigh ? 4096 : 1536;
  sunLight.shadow.mapSize.set(size, size);
  if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  document.getElementById('quality-btn').textContent = `Shadows: ${shadowHigh ? 'High' : 'Low'}`;
}
function toggleQuality() { shadowHigh = !shadowHigh; applyShadowQuality(); }
function setSide(color) {
  if (isAnimating) return;
  humanColor = color;
  document.querySelectorAll('#side-group .md-chip').forEach(b => b.classList.toggle('active', b.dataset.side === color));
  const turn = 2 * Math.PI;
  targetYaw = Math.round(targetYaw / turn) * turn + (color === 'b' ? Math.PI : 0);
  resetGame();
}
function toggleFull() {
  if (window.pywebview && window.pywebview.api) {
    window.pywebview.api.toggle_fullscreen();
  } else if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

document.querySelectorAll('#ai-group .md-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#ai-group .md-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    aiDepth = parseInt(btn.dataset.depth, 10);
    triggerAI();
  });
});

document.querySelectorAll('#side-group .md-chip').forEach(btn => {
  btn.addEventListener('click', () => setSide(btn.dataset.side));
});

document.querySelectorAll('#promo-group .md-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#promo-group .md-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    promoPiece = btn.dataset.promo;
  });
});

let lastTime = performance.now();
let frameCount = 0, fpsStart = performance.now();
let gpuName = 'WebGL';
try {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) gpuName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).replace(/\(.*?\)/g, '').slice(0, 42).trim() || 'WebGL';
} catch (_) {}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const elapsed = now * 0.001;

  frameCount++;
  if (now - fpsStart >= 500) {          // real elapsed time, not the clamped dt
    const fps = Math.round((frameCount * 1000) / (now - fpsStart));
    document.getElementById('telemetry').textContent = `${gpuName} • Shadows ${shadowHigh ? '4K' : '1.5K'} • ${fps} FPS`;
    frameCount = 0; fpsStart = now;
  }

  // Animate Wrought-Iron Brazier Flames
  brazierLights.forEach(b => {
    b.light.intensity = 0.92 + Math.sin(elapsed * 9 + b.phase) * 0.14;
  });
  flameCones.forEach(fc => {
    const f = Math.sin(elapsed * 11 + fc.phase) * 0.18;
    fc.mesh.scale.set(1 + f * 0.3, 1 + f * 0.5, 1 + f * 0.3);
  });

  // Animate 3D Tactical Move Markers
  animatedMarkers.forEach(m => {
    m.mesh.rotation.y = elapsed * 2.6;
    if (m.type === 'quiet') {
      m.mesh.position.y = 0.16 + Math.sin(elapsed * 4.0) * 0.04;
    } else {
      m.mesh.position.y = 2.15 + Math.sin(elapsed * 5.0) * 0.08;
    }
  });

  // Update Move / Lunge Attack / Shatter Animation
  if (activeAnim) {
    activeAnim.elapsed += dt;
    const t = Math.min(1, activeAnim.elapsed / activeAnim.duration);
    const att = activeAnim.attacker;

    if (activeAnim.isCapture) {
      if (t < 0.25) {
        const w = t / 0.25;
        att.userData.bodyGroup.position.y = w * 0.45;
        att.userData.weaponGroup.rotation.x = -w * 0.8;
      } else {
        const st = (t - 0.25) / 0.75;
        const ease = 1 - Math.pow(1 - st, 3);
        att.position.lerpVectors(activeAnim.start, activeAnim.end, ease);
        att.userData.bodyGroup.position.y = Math.sin(st * Math.PI) * 0.55;
        att.userData.weaponGroup.rotation.x = -0.8 + Math.min(1, st * 1.6) * 1.9;

        if (st >= 0.58 && !activeAnim.shattered) {
          activeAnim.shattered = true;
          if (activeAnim.defender) {
            const dir = new THREE.Vector3().subVectors(activeAnim.end, activeAnim.start).normalize();
            spawnShatter(activeAnim.defender.position, activeAnim.defender.userData.colorChar, dir);
            scene.remove(activeAnim.defender);
            delete pieceMeshes[activeAnim.capturedSq];
            shakeAmt = 0.35;
          }
        }
      }
    } else {
      const ease = t * t * (3 - 2 * t);
      att.position.lerpVectors(activeAnim.start, activeAnim.end, ease);
      att.userData.bodyGroup.position.y = Math.sin(t * Math.PI) * 0.35;
      if (activeAnim.rookAnim) {
        activeAnim.rookAnim.mesh.position.lerpVectors(activeAnim.rookAnim.start, activeAnim.rookAnim.end, ease);
      }
    }

    if (t >= 1) {
      const { moveObj } = activeAnim;
      delete pieceMeshes[moveObj.from];
      if (moveObj.promotion) {
        scene.remove(att);
        const promoted = buildPieceMesh(moveObj.promotion, moveObj.color);
        promoted.position.copy(activeAnim.end);
        promoted.userData.sq = moveObj.to;
        scene.add(promoted);
        pieceMeshes[moveObj.to] = promoted;
      } else {
        att.position.copy(activeAnim.end);
        att.userData.bodyGroup.position.y = 0;
        att.userData.weaponGroup.rotation.x = 0;
        att.userData.sq = moveObj.to;
        pieceMeshes[moveObj.to] = att;
      }
      activeAnim = null;
      isAnimating = false;
      rebuildTacticalMarkers();
      updateHUD();
      triggerAI();
    }
  }

  // Update Piece Idle Breathing & Levitation
  for (const sq in pieceMeshes) {
    const p = pieceMeshes[sq];
    if (activeAnim && p === activeAnim.attacker) continue;
    const ud = p.userData;
    const breath = Math.sin(elapsed * 2.4 + ud.phase) * 0.022;
    ud.bodyGroup.position.y = (sq === selectedSq ? 0.26 : 0) + Math.max(0, breath);
    ud.headGroup.rotation.y = Math.sin(elapsed * 1.5 + ud.phase) * 0.12;
    ud.weaponGroup.rotation.z = Math.cos(elapsed * 2.0 + ud.phase) * 0.06;
  }

  // Update Rigid-Body Shatter Shards
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.age += dt;
    if (s.age >= s.life) {
      scene.remove(s.mesh);
      shards.splice(i, 1);
      continue;
    }
    s.vel.y -= 15.5 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.rotation.x += s.rotVel.x * dt;
    s.mesh.rotation.y += s.rotVel.y * dt;
    if (s.mesh.position.y < 0.06) {
      s.mesh.position.y = 0.06;
      s.vel.y = Math.abs(s.vel.y) * 0.42;
      s.vel.x *= 0.72;
      s.vel.z *= 0.72;
    }
    const rem = s.life - s.age;
    if (rem < 0.5) s.mesh.scale.setScalar(Math.max(0.001, (rem / 0.5) * s.baseScale));
  }

  camYaw += (targetYaw - camYaw) * Math.min(1, dt * 8);
  camPitch += (targetPitch - camPitch) * Math.min(1, dt * 8);
  camDist += (targetDist - camDist) * Math.min(1, dt * 8);

  const cx = Math.sin(camYaw) * Math.cos(camPitch) * camDist;
  const cy = Math.sin(camPitch) * camDist;
  const cz = Math.cos(camYaw) * Math.cos(camPitch) * camDist;

  let sx = 0, sy = 0, sz = 0;
  if (shakeAmt > 0) {
    shakeAmt = Math.max(0, shakeAmt - dt * 1.5);
    sx = (Math.random() - 0.5) * shakeAmt;
    sy = (Math.random() - 0.5) * shakeAmt;
    sz = (Math.random() - 0.5) * shakeAmt;
  }

  camera.position.set(cx + sx, cy + sy, cz + sz);
  camera.lookAt(sx, 0.55 + sy, sz);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

applyShadowQuality();
updateHUD();
requestAnimationFrame(animate);
