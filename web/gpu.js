// Turns the browser's UNMASKED_RENDERER string into something short enough for the footer.

/** "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060". */
export function shortGpuName(raw) {
  const text = String(raw || '');
  if (/swiftshader/i.test(text)) return 'SwiftShader (software)';
  let name = text;
  const angle = text.match(/^ANGLE \((.*)\)$/);
  if (angle) {
    // split on top-level commas only (names can contain nested parentheses)
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of angle[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    parts.push(cur.trim());
    name = parts[1] || parts[0];
  }
  name = name
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s*(Direct3D\d*|OpenGL|vs_\d|ps_\d).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return name.slice(0, 42) || 'WebGL';
}
