import { create } from 'zustand';

// ─── Level requirement sets (shared curves, read from gems.json at load time) ──
// Stored as [gemLevel, charLevelReq] pairs. getLevelReq() interpolates.
type ReqPairs = [number, number][];
let _reqSets: Record<string, ReqPairs> = {
  active:   [[1,0],[2,3],[3,6],[4,10],[5,14],[6,18],[7,22],[8,26],[9,31],[10,36],[11,41],[12,46],[13,52],[14,58],[15,64],[16,66],[17,72],[18,78],[19,84],[20,90]],
  support:  [[1, 0]],
  fixed_26: [[1, 26]],
};

// A single gem entry from the gems.json catalog
export interface GemCatalogEntry {
  id: string;
  name: string;
  color: 1 | 2 | 3; // 1 = STR / red, 2 = DEX / green, 3 = INT / blue
  is_support: boolean;
  description: string;
  reqSet: string;       // key into reqSets — replaces per-gem levelRequirements array
  tags: string[];       // keyword tags extracted from description (e.g. "Fire", "AoE", "Strike")
  icon: string | null;  // webp filename for GEM_ICON_MAP lookup
}

interface GemStoreState {
  gems: GemCatalogEntry[];
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  loadGems: () => Promise<void>;
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
      const data = require('../../assets/data/gems.json') as {
        reqSets: Record<string, ReqPairs>;
        gems: GemCatalogEntry[];
      };
      // Hydrate shared req sets from JSON so future updates only need the JSON file
      if (data.reqSets) _reqSets = { ..._reqSets, ...data.reqSets };
      set({ gems: data.gems ?? [], isLoaded: true, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));

// ─── Pure helpers exported for components ────────────────────────────────────

/** Character-level requirement for a gem at a given gem level */
export function getLevelReq(gem: GemCatalogEntry, gemLevel: number): number {
  const pairs = _reqSets[gem.reqSet] ?? _reqSets.active;
  // Find the highest stored gemLevel ≤ requested
  let best = pairs[0];
  for (const pair of pairs) {
    if (pair[0] <= gemLevel && pair[0] >= best[0]) best = pair;
  }
  return best[1];
}

/**
 * STR / DEX / INT attribute requirements for a gem at a given gem level.
 *
 * In PoE2, stat requirements scale proportionally to the character-level
 * requirement. The maximum requirement at gem level 20 (charLevel 90) is
 * ~155. Formula: round(charLevelReq × 1.72).
 */
export function getAttrRequirement(
  color: 1 | 2 | 3,
  levelReq: number
): { str: number; dex: number; int: number } {
  const v = Math.round(levelReq * 1.72);
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

/** First 4 characters of a gem name for the fallback circle label */
export function gemAbbrev(name: string): string {
  return name.slice(0, 4).trim();
}
