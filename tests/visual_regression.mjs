import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(__dirname, 'visual_baselines');
const CURRENT_DIR = path.join(__dirname, 'visual_current');
const DIFF_DIR = path.join(__dirname, 'visual_diffs');

const CHROMIUM_FLAGS = [
  '--use-angle=swiftshader',
  '--use-gl=angle',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
  // No --allow-file-access-from-files: the app loads over HTTP (pywebview http_server=True), so the test does too.
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

/** Minimal static server for web/, mirroring how pywebview serves the UI. */
function startStaticServer() {
  const webRoot = path.join(ROOT, 'web');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(webRoot, rel);
    if (!file.startsWith(webRoot + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function captureScreenshots(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const server = await startStaticServer();
  const browser = await chromium.launch({
    headless: true,
    args: CHROMIUM_FLAGS,
    // Set CHROMIUM_PATH if Playwright's expected browser build is not installed (e.g. CI images, sandboxes).
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // ?wctest enables the window.* test hooks (state, handleSquareClick, camDist, ...).
    const url = `http://127.0.0.1:${server.address().port}/index.html?wctest`;

    await page.goto(url, { waitUntil: 'commit' });
    // Fixed wait for Three.js scene, textures, and canvas to initialize
    await page.waitForTimeout(2500);

    // 1. Distance 9
    await page.evaluate(() => {
      camDist = 9.0;
      targetDist = 9.0;
    });
    await page.waitForTimeout(600);
    const dist9Path = path.join(outputDir, 'dist_9.png');
    await page.screenshot({ path: dist9Path });
    console.log(`Saved: ${dist9Path}`);

    // 2. Distance 25
    await page.evaluate(() => {
      camDist = 25.0;
      targetDist = 25.0;
    });
    await page.waitForTimeout(600);
    const dist25Path = path.join(outputDir, 'dist_25.png');
    await page.screenshot({ path: dist25Path });
    console.log(`Saved: ${dist25Path}`);

    // 3. Selected pawn e2 (reset distance to 15.6 default)
    await page.evaluate(() => {
      camDist = 15.6;
      targetDist = 15.6;
      if (typeof handleSquareClick === 'function') {
        handleSquareClick('e2');
      }
    });
    await page.waitForTimeout(600);
    const selectedE2Path = path.join(outputDir, 'selected_e2.png');
    await page.screenshot({ path: selectedE2Path });
    console.log(`Saved: ${selectedE2Path}`);

    return { dist9Path, dist25Path, selectedE2Path };
  } finally {
    await browser.close();
    server.close();
  }
}

function compareImages(baselinePath, currentPath, diffPath, maxMismatchedPercent = 5.0) {
  const img1 = PNG.sync.read(fs.readFileSync(baselinePath));
  const img2 = PNG.sync.read(fs.readFileSync(currentPath));
  const { width, height } = img1;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.15 }
  );

  const totalPixels = width * height;
  const diffPercent = (numDiffPixels / totalPixels) * 100;

  if (diffPercent > maxMismatchedPercent) {
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    throw new Error(
      `Visual regression failure for ${path.basename(baselinePath)}: ${diffPercent.toFixed(2)}% difference (threshold: ${maxMismatchedPercent}%)`
    );
  }

  console.log(
    `Match OK for ${path.basename(baselinePath)}: ${diffPercent.toFixed(2)}% difference (within tolerance of ${maxMismatchedPercent}%)`
  );
}

async function main() {
  const isBaseline = process.argv.includes('--baseline');

  if (isBaseline || !fs.existsSync(BASELINE_DIR) || fs.readdirSync(BASELINE_DIR).length === 0) {
    console.log('Generating visual baselines...');
    await captureScreenshots(BASELINE_DIR);
    console.log('Baselines saved successfully to', BASELINE_DIR);
  } else {
    console.log('Comparing against existing visual baselines...');
    await captureScreenshots(CURRENT_DIR);

    const shots = ['dist_9.png', 'dist_25.png', 'selected_e2.png'];
    for (const shot of shots) {
      const bPath = path.join(BASELINE_DIR, shot);
      const cPath = path.join(CURRENT_DIR, shot);
      const dPath = path.join(DIFF_DIR, `diff_${shot}`);
      compareImages(bPath, cPath, dPath);
    }
    console.log('All visual regression tests PASSED!');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
