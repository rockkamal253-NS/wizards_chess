import { state } from './state.js';
import { cg, SQ_SIZE, obsidianTex, MAT_MARBLE_BRONZE } from './materials.js';

// ============================================================================
// GOTHIC CATHEDRAL ARCHITECTURE & WROUGHT-IRON TRIPOD BRAZIERS
// ============================================================================
export function buildCathedral(scene) {
  const cath = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0x8899EE, 0x161222, 0.42);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xE6ECFF, 1.05);
  state.sunLight = dirLight;
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
    color: 0x171421,
    bumpMap: obsidianTex.bumpMap,
    bumpScale: 0.02,
    roughness: 0.48,
    metalness: 0.15
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
    color: 0x1B1726,
    roughness: 0.28,
    metalness: 0.35,
    clearcoat: 0.45
  });
  const frameOuter = new THREE.Mesh(cg(THREE.BoxGeometry, SQ_SIZE * 8 + 1.25, 0.24, SQ_SIZE * 8 + 1.25), frameMat);
  frameOuter.position.y = -0.14; // top at -0.02
  frameOuter.receiveShadow = true;
  cath.add(frameOuter);

  const goldTrim = new THREE.Mesh(cg(THREE.BoxGeometry, SQ_SIZE * 8 + 0.16, 0.26, SQ_SIZE * 8 + 0.16), MAT_MARBLE_BRONZE);
  goldTrim.position.y = -0.138; // top at -0.008, safely under the tiles (top at 0)
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
      col.castShadow = true;
      col.receiveShadow = true;
      cath.add(col);
    });
  });

  // Wrought-Iron Gothic Tripod Braziers
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1F1C29, roughness: 0.4, metalness: 0.85 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xFF4500 });

  state.brazierLights = [];
  state.flameCones = [];

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

    // Multi-Tongue Sculpted Fire Cones
    const tongues = [];
    for (let t = 0; t < 5; t++) {
      const isCore = t === 0;
      const tMat = new THREE.MeshBasicMaterial({
        color: isCore ? 0xFFF099 : (t % 2 === 0 ? 0xFF9922 : 0xFF4411),
        transparent: true,
        opacity: isCore ? 0.95 : 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const cone = new THREE.Mesh(cg(THREE.ConeGeometry, isCore ? 0.24 : 0.18, isCore ? 0.85 : 0.65, 10), tMat);
      const rad = isCore ? 0 : 0.16;
      const a = t * 1.5;
      cone.position.set(Math.cos(a) * rad, 1.82, Math.sin(a) * rad);
      bGroup.add(cone);
      tongues.push({ mesh: cone, baseH: isCore ? 0.85 : 0.65, phase: idx * 2.1 + t * 1.3 });
    }
    state.flameCones.push(...tongues);

    const pLight = new THREE.PointLight(0xFF8C32, 0.92, 19, 1.8);
    pLight.position.set(0, 2.2, 0);
    bGroup.add(pLight);
    state.brazierLights.push({ light: pLight, phase: idx * 1.7 });

    cath.add(bGroup);
  });

  scene.add(cath);
  return cath;
}
