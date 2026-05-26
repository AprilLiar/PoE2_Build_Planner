import { create } from 'zustand';

// A single gem entry from the gems.json catalog
export interface GemCatalogEntry {
  id: string;
  name: string;
  color: 1 | 2 | 3; // 1 = STR / red, 2 = DEX / green, 3 = INT / blue
  is_support: boolean;
  tags: string[];           // raw tags from gems.json; empty for most supports
  description: string;
  // Level requirement at each gem level — only a subset of levels is stored
  levelRequirements: Array<{ gemLevel: number; levelReq: number }>;
  // Webp filename for GEM_ICON_MAP lookup (e.g. "Leap Slam.webp" or "acrimonysupport.webp")
  icon: string | null;
}

interface GemStoreState {
  gems: GemCatalogEntry[];
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  loadGems: () => Promise<void>;
}

// Flat-array schema from gems.json (Sprint 6.5 format)
interface RawGem {
  id: string;
  name: string;
  is_support: boolean;
  icon?: string | null;
  tags?: string[];
}

// Derive gem color from tags.
// Priority order: DEX (most specific ranged tags) → STR (melee/physical/warcry) → INT (elemental/spell) → STR fallback for attacks → INT default.
// Support gems in the current gems.json have no tags, so their color cannot be determined; they keep the INT default for display only.
function deriveColor(tags: string[] = []): 1 | 2 | 3 {
  const t = new Set(tags.map(x => x.toLowerCase()));
  if (t.has('trap') || t.has('mine') || t.has('projectile')) return 2;           // DEX
  if (t.has('melee') || t.has('warcry') || t.has('physical')) return 1;          // STR
  if (t.has('spell') || t.has('cold') || t.has('fire') || t.has('lightning')     // INT
      || t.has('chaos') || t.has('curse') || t.has('minion')) return 3;
  if (t.has('attack')) return 1;                                                  // STR fallback for generic attacks
  return 3;
}

export const useGemStore = create<GemStoreState>((set, get) => ({
  gems: [],
  isLoaded: false,
  isLoading: false,
  error: null,

  loadGems: async () => {
    const { isLoaded, isLoading } = get();
    if (isLoaded || isLoading) return;

    set({ isLoading: true, error: null });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const raw = require('../../assets/data/gems.json') as RawGem[] | { gems: RawGem[] };
      const items: RawGem[] = Array.isArray(raw) ? raw : (raw.gems ?? []);
      const gems: GemCatalogEntry[] = items.map((r) => ({
        id: r.id,
        name: r.name,
        is_support: r.is_support,
        tags: r.tags ?? [],
        color: deriveColor(r.tags),
        description: (r.tags ?? []).length > 0
          ? (r.tags!).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' · ')
          : '',
        levelRequirements: [],
      }));
      set({ gems, isLoaded: true, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));

// --- Pure helpers exported for components ---

/** Character-level requirement for a gem at a given gem level */
export function getLevelReq(gem: GemCatalogEntry, gemLevel: number): number {
  if (!gem.levelRequirements.length) return 0;
  // Find the highest stored entry whose gemLevel ≤ the requested level
  const sorted = [...gem.levelRequirements].sort((a, b) => b.gemLevel - a.gemLevel);
  return (sorted.find((lr) => lr.gemLevel <= gemLevel) ?? sorted[sorted.length - 1]).levelReq;
}

/**
 * Derive STR / DEX / INT attribute requirements from a gem's color and level.
 * PoE2 Lua data only stores levelRequirement; the attribute demand is
 * approximately 60% of levelRequirement for the gem's matching attribute.
 */
export function getAttrRequirement(
  color: 1 | 2 | 3,
  levelReq: number
): { str: number; dex: number; int: number } {
  const v = Math.max(0, Math.floor(levelReq * 0.6));
  return {
    str: color === 1 ? v : 0,
    dex: color === 2 ? v : 0,
    int: color === 3 ? v : 0,
  };
}

/** Hex border/fill colour for a gem's attribute color */
export function gemColorHex(color: 1 | 2 | 3): string {
  if (color === 1) return '#DC2626'; // STR — red
  if (color === 2) return '#16A34A'; // DEX — green
  return '#2563EB'; // INT — blue
}

/** Background fill for a gem circle */
export function gemColorBg(color: 1 | 2 | 3): string {
  if (color === 1) return '#3B0A0A';
  if (color === 2) return '#052E16';
  return '#0C1A3B';
}

/** Human-readable attribute name for a color */
export function gemColorLabel(color: 1 | 2 | 3): string {
  if (color === 1) return 'STR';
  if (color === 2) return 'DEX';
  return 'INT';
}

/** First 4 characters of a gem name to display inside a small circle */
export function gemAbbrev(name: string): string {
  return name.slice(0, 4).trim();
}
