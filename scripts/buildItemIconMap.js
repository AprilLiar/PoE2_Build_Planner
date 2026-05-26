#!/usr/bin/env node
// Fetches items.ndjson from Exiled-Exchange-2 and extracts a name→CDN-URL map
// for all ITEM and UNIQUE namespace entries. Output: assets/data/item-icons.json
//
// Run with: node scripts/buildItemIconMap.js
// Re-run only when you want to refresh icon URLs (they rarely change).

const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCE_URL =
  'https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/master/renderer/public/data/en/items.ndjson';

const OUT_FILE = path.resolve(__dirname, '../assets/data/item-icons.json');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching items.ndjson from Exiled-Exchange-2...');
  const raw = await fetchUrl(SOURCE_URL);

  const lines = raw.split('\n').filter((l) => l.trim());
  console.log(`  Parsed ${lines.length} lines`);

  const iconMap = {};
  let kept = 0;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.namespace !== 'ITEM' && entry.namespace !== 'UNIQUE') continue;
    if (!entry.icon) continue;

    if (entry.name) {
      iconMap[entry.name] = entry.icon;
      kept++;
    }
    // Also index by refName as fallback key (different from name for some uniques)
    if (entry.refName && entry.refName !== entry.name) {
      iconMap[entry.refName] = entry.icon;
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(iconMap, null, 2));
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`Done. ${kept} entries written to ${OUT_FILE} (${kb} KB)`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
