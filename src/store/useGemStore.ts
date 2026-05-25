import { create } from 'zustand';

// A single gem entry from the gems.json catalog
export interface GemCatalogEntry {
  id: string;
  name: string;
  color: 1 | 2 | 3; // 1 = STR / red, 2 = DEX / green, 3 = INT / blue
  is_support: boolean;
  description: string;
  // Level requirement at each gem level — only a subset of levels is stored
  levelRequirements: Array<{ gemLevel: number; levelReq: number }>;
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
      const data = require('../../assets/data/gems.json') as { gems: GemCatalogEntry[] };
      set({ gems: data.gems ?? [], isLoaded: true, isLoading: false });
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
