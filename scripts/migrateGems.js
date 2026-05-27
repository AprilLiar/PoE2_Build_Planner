/**
 * Migrates assets/data/gems.json to the simplified v2 format:
 *  - Replaces per-gem levelRequirements arrays with a reqSet reference
 *  - Adds keyword-based tags[] extracted from the description
 *  - Fixes icon references for orphaned webp files
 *
 * Usage:  node scripts/migrateGems.js
 * Output: assets/data/gems.json (overwrites in place)
 */

const fs = require('fs');
const path = require('path');

// ─── Req set definitions ────────────────────────────────────────────────────

// The standard active-gem curve (all 289 active gems share this or a subset)
const ACTIVE_CURVE = [
  [1,0],[2,3],[3,6],[4,10],[5,14],[6,18],[7,22],[8,26],[9,31],[10,36],
  [11,41],[12,46],[13,52],[14,58],[15,64],[16,66],[17,72],[18,78],[19,84],[20,90],
];

const REQ_SETS = {
  active:   ACTIVE_CURVE,
  support:  [[1, 0]],
  fixed_26: [[1, 26]],  // Cast on Melee Kill / Stun — always req level 26
};

// Encode a gem's levelRequirements array as a reqSet key
function classifyReqSet(levelRequirements) {
  if (!levelRequirements || levelRequirements.length === 0) return 'support';

  // Single entry with 0 — support or zero-req active
  if (levelRequirements.length === 1 && levelRequirements[0].levelReq === 0) return 'support';

  // Single entry with 26 at level 8 — Cast on event gems
  const first = levelRequirements[0];
  if (levelRequirements.length === 1 && first.levelReq === 26) return 'fixed_26';
  if (first.gemLevel === 8 && first.levelReq === 26) return 'fixed_26';

  // All zeros (Explosive Demise style)
  if (levelRequirements.every(r => r.levelReq === 0)) return 'support';

  // Default: standard active curve
  return 'active';
}

// ─── Tag extraction ─────────────────────────────────────────────────────────

const TAG_RULES = [
  // Skill category
  { tag: 'Attack',      re: /\battacks?\b/i },
  { tag: 'Spell',       re: /\bspells?\b|\bcast\b/i },
  { tag: 'AoE',         re: /\b(area|radius|explosion|nova)\b/i },
  { tag: 'Projectile',  re: /\b(projectile|fires? a|fires? \w+|arrow|bolt|bullet)\b/i },
  { tag: 'Melee',       re: /\bmelee\b/i },
  { tag: 'Strike',      re: /\bstrike\b/i },
  { tag: 'Slam',        re: /\bslam\b/i },
  { tag: 'Bow',         re: /\bbow\b/i },
  { tag: 'Warcry',      re: /\bwarcry\b|\bwar cry\b/i },
  { tag: 'Totem',       re: /\btotem\b/i },
  { tag: 'Minion',      re: /\bminions?\b|\bsummons?\b|\bskeleton\b|\bzombie\b|\bspectres?\b/i },
  { tag: 'Channelling', re: /\bchannel/i },
  { tag: 'Trigger',     re: /\btrigger\b/i },
  { tag: 'Movement',    re: /\bdash\b|\bleaps?\b|\bteleport\b|\bmovement\b/i },
  // Damage type
  { tag: 'Fire',        re: /\bfire\b|\bignit|\bburning\b|\bflame\b/i },
  { tag: 'Cold',        re: /\bcold\b|\bfreez|\bchill\b|\bice\b|\bfrost\b/i },
  { tag: 'Lightning',   re: /\blightning\b|\bshocks?\b|\belectro/i },
  { tag: 'Chaos',       re: /\bchaos\b|\bpoisons?\b|\bwither\b/i },
  { tag: 'Physical',    re: /\bphysical\b/i },
  // Mechanics
  { tag: 'Duration',    re: /\bduration\b|\blasts\b/i },
  { tag: 'Buff',        re: /\bbuffs?\b/i },
  { tag: 'Debuff',      re: /\bdebuffs?\b/i },
  { tag: 'Aura',        re: /\baura\b/i },
  { tag: 'Herald',      re: /\bherald\b/i },
  { tag: 'Curse',       re: /\bcurse\b/i },
  { tag: 'Mark',        re: /\bmarks?\b/i },
  { tag: 'Vaal',        re: /\bvaal\b/i },
];

function extractTags(description, is_support) {
  const tags = new Set();
  if (is_support) tags.add('Support');
  for (const { tag, re } of TAG_RULES) {
    if (re.test(description)) tags.add(tag);
  }
  return [...tags];
}

// ─── Orphan icon matching ────────────────────────────────────────────────────

// Webp files that exist but aren't referenced — try to wire them to null-icon gems
function buildOrphanMap(gemsWithNullIcon, flatFileKeys) {
  const normalise = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nullIconByName = new Map(gemsWithNullIcon.map(g => [normalise(g.name), g.id]));

  const fixes = {};
  for (const file of flatFileKeys) {
    const key = normalise(file.replace('.webp', ''));
    if (nullIconByName.has(key)) {
      fixes[nullIconByName.get(key)] = file;
    }
  }
  return fixes;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const gemJsonPath = path.join(__dirname, '..', 'assets', 'data', 'gems.json');
const skillGemsDir = path.join(__dirname, '..', 'assets', 'poe2', 'skill-gems');

const raw = JSON.parse(fs.readFileSync(gemJsonPath, 'utf8'));
const gems = raw.gems;

// Build set of all flat file keys (same namespace as GEM_ICON_MAP)
const flatFiles = [
  ...fs.readdirSync(skillGemsDir).filter(f => f.endsWith('.webp')),
  ...fs.readdirSync(path.join(skillGemsDir, 'support')).filter(f => f.endsWith('.webp')),
];
const existingIcons = new Set(gems.filter(g => g.icon).map(g => g.icon));
const orphanFiles = flatFiles.filter(f => !existingIcons.has(f));
const orphanFixes = buildOrphanMap(gems.filter(g => !g.icon), orphanFiles);

console.log(`Fixing ${Object.keys(orphanFixes).length} gems by matching orphan file names`);

// Track counts for summary
let reqSetCounts = { active: 0, support: 0, fixed_26: 0 };

const migratedGems = gems.map(gem => {
  const reqSet = classifyReqSet(gem.levelRequirements);
  reqSetCounts[reqSet] = (reqSetCounts[reqSet] || 0) + 1;

  const tags = extractTags(gem.description || '', gem.is_support);
  const icon = gem.icon ?? orphanFixes[gem.id] ?? null;

  // Build new minimal gem object (no levelRequirements array)
  return {
    id: gem.id,
    name: gem.name,
    color: gem.color,
    is_support: gem.is_support,
    description: gem.description,
    reqSet,
    tags,
    icon,
  };
});

const output = { reqSets: REQ_SETS, gems: migratedGems };
fs.writeFileSync(gemJsonPath, JSON.stringify(output, null, 2));

const newSize = fs.statSync(gemJsonPath).size;
console.log(`Done. reqSet distribution:`, reqSetCounts);
console.log(`New gems.json size: ${(newSize / 1024).toFixed(1)} KB`);
