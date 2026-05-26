// All build data is stored as a single JSON file on the device filesystem.

export interface Build {
  schema_version: number;      // increment when schema changes — current: 1
  id: string;                  // UUID, generated once at creation
  name: string;                // user-defined build name
  game_version: string;        // PoE2 patch string, e.g. "0.4.0"
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601 — updated on every save
  character: {
    class: string;             // e.g. "Witch", "Ranger"
    ascendancy: string | null; // e.g. "Infernalist", null if not chosen
    level: number;             // 1–100
  };
  skill_tree: {
    allocated_nodes: number[]; // node IDs from GGG tree JSON
    tree_version: string;      // version string from GGG tree export
  };
  items: Item[];
  gems: GemLink[];
  notes: string;               // freeform text — no UI in v1, preserved on import/export
}

export interface Item {
  slot: ItemSlot;
  name: string;
  base_type: string;
  rarity: 'Normal' | 'Magic' | 'Rare' | 'Unique';
  raw_text: string;            // original Ctrl+C paste from in-game
  mods: string[];              // parsed mod lines
  icon?: string;               // GGG CDN URL resolved at parse time
}

export type ItemSlot =
  | 'Helm' | 'Chest' | 'Gloves' | 'Boots'
  | 'Weapon1' | 'Weapon2' | 'Offhand1' | 'Offhand2'
  | 'Ring1' | 'Ring2' | 'Amulet' | 'Belt'
  | 'Flask1' | 'Flask2' | 'Flask3' | 'Flask4' | 'Flask5'
  | 'Charm1' | 'Charm2' | 'Charm3';

export interface GemLink {
  id: string;           // UUID
  label: string;        // user-defined, e.g. "Main Skill"
  gems: SocketedGem[];
}

export interface SocketedGem {
  id: string;           // UUID
  name: string;         // must match a name in assets/data/gems.json
  level: number;        // 1–20
  quality: number;      // 0–20
  is_support: boolean;
}
