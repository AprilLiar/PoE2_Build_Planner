#!/usr/bin/env node
// Generates src/assets/nodeIconMap.ts — a static Metro-compatible require() map
// for all 540 PoE2 passive skill node icons.
//
// Usage: node scripts/generate_node_icon_map.js
//
// Re-run whenever new icons are added to assets/poe2/node-icons/.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const tree = require(path.join(ROOT, 'assets/data/tree.json'));

const icons = new Set();
for (const node of Object.values(tree.nodes)) {
  if (node.icon) icons.add(node.icon);
}
console.log('Unique icons in tree.json:', icons.size);

const entries = [];
let missing = 0;
for (const ddsPath of [...icons].sort()) {
  const webpPath = path.join(ROOT, 'assets/poe2/node-icons', ddsPath.replace('.dds', '.webp'));
  if (!fs.existsSync(webpPath)) {
    console.warn('MISSING:', ddsPath);
    missing++;
    continue;
  }
  const relPath = '../../assets/poe2/node-icons/' + ddsPath.replace('.dds', '.webp');
  entries.push({ key: ddsPath, require: relPath });
}
if (missing > 0) console.warn(`${missing} icon(s) missing — they will be excluded from the map.`);

let out = `// AUTO-GENERATED — do not edit manually
// Run: node scripts/generate_node_icon_map.js

// require() in Metro returns a number (the asset module ID).
// Skia's useImage / DataSourceParam accepts a number directly.
const NODE_ICON_REQUIRES: Record<string, number> = {
`;
for (const e of entries) {
  const escaped = e.key.replace(/'/g, "\\'");
  out += `  '${escaped}': require('${e.require}'),\n`;
}
out += `};

export function getNodeIconSource(ddsPath: string): number | null {
  return NODE_ICON_REQUIRES[ddsPath] ?? null;
}
`;

const outPath = path.join(ROOT, 'src/assets/nodeIconMap.ts');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log(`Written: ${outPath} (${entries.length} entries, ${fs.statSync(outPath).size} bytes)`);
