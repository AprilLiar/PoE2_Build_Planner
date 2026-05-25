#!/usr/bin/env node
// Regenerates src/assets/gemIconMap.generated.ts from the local webp files.
// Run with: node scripts/buildGemIconMap.js
// Re-run whenever new icon files are added to assets/poe2/skill-gems/.

const fs = require('fs');
const path = require('path');

const activeDir = path.resolve(__dirname, '../assets/poe2/skill-gems');
const supportDir = path.resolve(__dirname, '../assets/poe2/skill-gems/support');
const outFile = path.resolve(__dirname, '../src/assets/gemIconMap.generated.ts');

const activeFiles = fs.readdirSync(activeDir)
  .filter(f => f.endsWith('.webp'))
  .sort();

const supportFiles = fs.readdirSync(supportDir)
  .filter(f => f.endsWith('.webp'))
  .sort();

const lines = [
  '// AUTO-GENERATED — do not edit. Run scripts/buildGemIconMap.js to regenerate.',
  "import type { ImageSourcePropType } from 'react-native';",
  '',
  '// Maps icon filename (stored in gem.icon) -> static require() for React Native Image',
  'export const GEM_ICON_MAP: Record<string, ImageSourcePropType> = {',
];

for (const f of activeFiles) {
  const safe = f.replace(/'/g, "\\'");
  lines.push(`  '${safe}': require('../../assets/poe2/skill-gems/${safe}'),`);
}

for (const f of supportFiles) {
  const safe = f.replace(/'/g, "\\'");
  lines.push(`  '${safe}': require('../../assets/poe2/skill-gems/support/${safe}'),`);
}

lines.push('};', '');

fs.writeFileSync(outFile, lines.join('\n'));
console.log(
  `Generated ${outFile}\n` +
  `  Active icons:  ${activeFiles.length}\n` +
  `  Support icons: ${supportFiles.length}\n` +
  `  Total:         ${activeFiles.length + supportFiles.length}`
);
