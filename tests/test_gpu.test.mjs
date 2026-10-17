import test from 'node:test';
import assert from 'node:assert/strict';
import { shortGpuName } from '../web/gpu.js';

test('shortGpuName simplifies common renderer strings', () => {
  assert.equal(shortGpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'NVIDIA GeForce RTX 3060');
  assert.equal(shortGpuName('ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'Intel UHD Graphics 630');
  assert.equal(shortGpuName('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'AMD Radeon Graphics');
  assert.equal(shortGpuName('Apple M2'), 'Apple M2');
  assert.equal(shortGpuName('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), 'SwiftShader (software)');
});

test('shortGpuName falls back safely', () => {
  assert.equal(shortGpuName(''), 'WebGL');
  assert.equal(shortGpuName(undefined), 'WebGL');
  assert.ok(shortGpuName('x'.repeat(200)).length <= 42);
});
