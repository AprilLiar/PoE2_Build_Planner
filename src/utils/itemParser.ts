// Section types that appear between the -------- separators in PoE item text
export type SectionType = 'properties' | 'mods' | 'flag';

export interface ParsedSection {
  type: SectionType;
  lines: string[];
}

export interface ParseResult {
  name: string;
  base_type: string;
  rarity: 'Normal' | 'Magic' | 'Rare' | 'Unique';
  item_level?: number;
  is_corrupted: boolean;
  is_unidentified: boolean;
  mods: string[];              // flat list of mod lines (backward compat)
  sections: ParsedSection[];   // structured sections for tooltip rendering
}

export type ParseOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string };

// Item state flags that appear as single-line sections after --------
const FLAG_RE = /^(Corrupted|Unidentified|Mirrored|Split|Shaper Item|Elder Item|Synthesis Base Item)$/;

// Lines that are item properties (stats/requirements/labels), not player-affecting mods
const PROPERTY_RE = [
  /^Item (Class|Level):/,
  /^Rarity:/,
  /^Quality:/,
  /^(Physical|Fire|Cold|Lightning|Chaos) Damage:/,
  /^Critical Hit Chance:/,
  /^Attacks per Second:/,
  /^Weapon Range:/,
  /^Armour:/,
  /^Evasion Rating:/,
  /^Energy Shield:/,
  /^Ward:/,
  /^Requirements:/,
  /^(Level|Str|Dex|Int):/,
  /^Socketed Gems?:/,
  /^Stack Size:/,
  /^Lasts /,
  /^Consumes /,
  /^Currently has /,
  /^Recovers /,
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

// Classify a section based on its lines.
// Flags are checked first since "Corrupted" etc. also match isProperty.
function classifySection(lines: string[]): SectionType {
  if (lines.length > 0 && lines.every(l => FLAG_RE.test(l))) return 'flag';
  if (lines.every(l => isProperty(l))) return 'properties';
  return 'mods';
}

export function parseItem(rawText: string): ParseOutcome {
  // Normalise line endings and split into sections on the -------- separator
  const rawSections = rawText
    .replace(/\r\n/g, '\n')
    .split(/\n?-{8}\n?/)
    .map((s) => s.split('\n').map((l) => l.trim()).filter(Boolean));

  if (!rawSections.length || !rawSections[0].length) {
    return { ok: false, error: 'Item text appears to be empty.' };
  }

  const header = rawSections[0];

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

  // Extract name and base_type from header non-metadata lines
  const nameLines = header.filter(
    (l) => !l.startsWith('Item Class:') && !l.startsWith('Rarity:')
  );

  let name = '';
  let base_type = '';

  if (rarity === 'Rare' || rarity === 'Unique') {
    name = nameLines[0] ?? '';
    base_type = nameLines[1] ?? nameLines[0] ?? '';
  } else {
    name = nameLines[0] ?? '';
    base_type = name;
  }

  if (!name) {
    return { ok: false, error: 'Could not extract item name from header.' };
  }

  // Classify each section after the header
  const sections: ParsedSection[] = [];
  const mods: string[] = []; // flat mod list for backward compat
  let item_level: number | undefined;
  let is_corrupted = false;
  let is_unidentified = false;

  for (let i = 1; i < rawSections.length; i++) {
    const lines = rawSections[i];
    if (!lines.length) continue;

    const type = classifySection(lines);
    sections.push({ type, lines });

    if (type === 'properties') {
      for (const line of lines) {
        const match = line.match(/^Item Level:\s*(\d+)/);
        if (match) item_level = Number(match[1]);
      }
    } else if (type === 'mods') {
      for (const line of lines) {
        if (!isProperty(line)) mods.push(line);
      }
    } else if (type === 'flag') {
      for (const line of lines) {
        if (line === 'Corrupted') is_corrupted = true;
        if (line === 'Unidentified') is_unidentified = true;
      }
    }
  }

  return {
    ok: true,
    result: { name, base_type, rarity, item_level, is_corrupted, is_unidentified, mods, sections },
  };
}
