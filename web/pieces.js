import {
  cg,
  MAT_MARBLE_BODY,
  MAT_MARBLE_BRONZE,
  MAT_MARBLE_TRIM,
  MAT_OBSIDIAN_BODY,
  MAT_OBSIDIAN_CRIMSON,
  MAT_OBSIDIAN_TRIM
} from './materials.js';

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
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 2,
    bevelSize: 0.05,
    bevelThickness: 0.05
  });
  geo.center();
  geo.rotateY(Math.PI / 2);
  return geo;
}
const GEO_KNIGHT_SCULPT = createKnightSculptGeo();

export function buildPieceMesh(type, colorChar) {
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
  ped.castShadow = true;
  ped.receiveShadow = true;
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
    torso.castShadow = true;
    torso.receiveShadow = true;
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
    tower.castShadow = true;
    tower.receiveShadow = true;
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
    horse.castShadow = true;
    horse.receiveShadow = true;
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
    robe.castShadow = true;
    robe.receiveShadow = true;
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
    gown.castShadow = true;
    gown.receiveShadow = true;
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
    ring2.position.y = 0.68;
    ring2.rotation.y = Math.PI / 2;
    weaponGroup.add(scepter, ring1, ring2);

  } else if (type === 'k') {
    // GRAND MONARCH KING: Plated Royal Mantle, Imperial Arched Crown & Planted Greatsword
    const mantle = new THREE.Mesh(GEO_KING_MANTLE, mainMat);
    mantle.castShadow = true;
    mantle.receiveShadow = true;
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
