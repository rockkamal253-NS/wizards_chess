import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('VERSION file exists and contains valid semver', () => {
  const versionPath = path.join(ROOT, 'VERSION');
  assert.ok(fs.existsSync(versionPath), 'VERSION file must exist at repo root');
  const version = fs.readFileSync(versionPath, 'utf8').trim();
  assert.match(version, /^\d+\.\d+\.\d+$/, 'VERSION must follow semver format (X.Y.Z)');
});

test('docs/CHANGELOG.md exists and documents the current version', () => {
  const versionPath = path.join(ROOT, 'VERSION');
  const version = fs.readFileSync(versionPath, 'utf8').trim();

  const changelogPath = path.join(ROOT, 'docs', 'CHANGELOG.md');
  assert.ok(fs.existsSync(changelogPath), 'docs/CHANGELOG.md must exist');
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  assert.ok(
    changelog.includes(`[${version}]`),
    `docs/CHANGELOG.md must document release version [${version}]`
  );
});

test('web/index.html displays the version in the UI footer', () => {
  const versionPath = path.join(ROOT, 'VERSION');
  const version = fs.readFileSync(versionPath, 'utf8').trim();

  const indexPath = path.join(ROOT, 'web', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.ok(
    html.includes(`id="app-version"`),
    'web/index.html must have an element with id="app-version"'
  );
  assert.ok(
    html.includes(`v${version}`),
    `web/index.html must display v${version} in the footer`
  );
});
