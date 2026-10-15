// ============================================================================
// PROCEDURAL MARBLE, OBSIDIAN & HDRI ENVIRONMENT TEXTURES
// ============================================================================
export function buildCathedralHDRI(renderer, cg) {
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

export function createStoneTextures(renderer, isMarble, base) {
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
    cCtx.beginPath();
    bCtx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    cCtx.moveTo(x, y);
    bCtx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (Math.random() - 0.5) * 90;
      y += (Math.random() - 0.5) * 90;
      cCtx.lineTo(x, y);
      bCtx.lineTo(x, y);
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
