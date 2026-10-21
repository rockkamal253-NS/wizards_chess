import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_WEB_ROOT = path.resolve(__dirname, '..', 'web');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

/**
 * Starts a minimal, dependency-free static HTTP server for web/.
 * Returns a Promise resolving to the http.Server instance.
 */
export function startStaticServer(webRoot = DEFAULT_WEB_ROOT, port = 0) {
  const root = path.resolve(webRoot);
  const server = http.createServer((req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (_) {
      res.writeHead(500);
      res.end('internal server error');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// CLI entry point (e.g. npm run serve)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = parseInt(process.env.PORT || '8080', 10);
  startStaticServer(DEFAULT_WEB_ROOT, port).then(server => {
    const actualPort = server.address().port;
    console.log(`Wizard's Chess static server running at:`);
    console.log(`  App URL:  http://127.0.0.1:${actualPort}/index.html`);
    console.log(`  Test URL: http://127.0.0.1:${actualPort}/index.html?wctest`);
  }).catch(err => {
    console.error('Failed to start static server:', err);
    process.exit(1);
  });
}
