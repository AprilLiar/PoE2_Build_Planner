export interface ParseResult {
  name: string;
  base_type: string;
  rarity: 'Normal' | 'Magic' | 'Rare' | 'Unique';
  mods: string[];
}

export type ParseOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string };

// Lines that are item properties, not mods
const PROPERTY_RE = [
  /^Item (Class|Level):/,
  /^Rarity:/,
  /^Quality:/,
  /^(Physical|Fire|Cold|Lightning|Chaos) Damage:/,
  /^Critical Hit Chance:/,
  /^Attacks per Second:/,
  /^Armour:/,
  /^Evasion Rating:/,
  /^Energy Shield:/,
  /^Ward:/,
  /^Requirements:/,
  /^(Level|Str|Dex|Int):/,
  /^Socketed Gems?:/,
  /^Stack Size:/,
  /^Note:/,
  /^Corrupted$/,
  /^Unidentified$/,
  /^Mirrored$/,
  /^Shaper Item$/,
  /^Elder Item$/,
  /^Synthesis Base Item$/,
  /^Split$/,
];

function isProperty(line: string): boolean {
  return PROPERTY_RE.some((re) => re.test(line));
}

export function parseItem(rawText: string): ParseOutcome {
  // Normalise line endings and split into sections
  const sections = rawText
    .replace(/\r\n/g, '\n')
    .split(/\n?-{8}\n?/)
    .map((s) => s.split('\n').map((l) => l.trim()).filter(Boolean));

  if (!sections.length || !sections[0].length) {
    return { ok: false, error: 'Item text appears to be empty.' };
  }

  const header = sections[0];

  // Extract rarity
  let rarity: ParseResult['rarity'] | null = null;
  for (const line of header) {
    if (line.startsWith('Rarity:')) {
      const r = line.slice(7).trim();
      if (r === 'Magic') rarity = 'Magic';
      else if (r === 'Rare') rarity = 'Rare';
      else if (r === 'Unique') rarity = 'Unique';
      else rarity = 'Normal';
      break;
    }
  }
  if (rarity === null) {
    return { ok: false, error: 'Could not find "Rarity:" line. Make sure you copied the full item text.' };
  }

  // Extract name and base_type from header non-property lines
  const nameLines = header.filter(
    (l) => !l.startsWith('Item Class:') && !l.startsWith('Rarity:')
  );

  let name = '';
  let base_type = '';

  if (rarity === 'Rare' || rarity === 'Unique') {
    // Two-line header: first is the generated/unique name, second is the base type
    name = nameLines[0] ?? '';
    base_type = nameLines[1] ?? nameLines[0] ?? '';
  } else {
    // Normal/Magic: single name line, name === base_type
    name = nameLines[0] ?? '';
    base_type = name;
  }

  if (!name) {
    return { ok: false, error: 'Could not extract item name from header.' };
  }

  // Collect mods from all sections after the header
  const mods: string[] = [];
  for (let i = 1; i < sections.length; i++) {
    for (const line of sections[i]) {
      if (!isProperty(line)) {
        mods.push(line);
      }
    }
  }

  return { ok: true, result: { name, base_type, rarity, mods } };
}
