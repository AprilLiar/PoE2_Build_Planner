import { create } from 'zustand';
import { COLORS } from '../constants/colors';

export interface TreeNode {
  skill: number;
  name: string;
  stats?: string[];
  icon?: string;
  ascendancyName?: string;
  isKeystone?: boolean;
  isNotable?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  connections?: { id: number; orbit: number }[];
  group?: number;
  orbit?: number;
  orbitIndex?: number;
}

export interface TreeClass {
  name: string;
  ascendancies: { name: string; displayName: string }[];
}

interface TreeStoreState {
  nodes: Record<number, TreeNode>;
  classes: TreeClass[];
  allocatedNodes: Set<number>;
  selectedClass: string | null;
  selectedAscendancy: string | null;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  loadTree: () => Promise<void>;
  toggleNode: (id: number) => void;
  clearAll: () => void;
  setSelectedClass: (name: string | null) => void;
  setSelectedAscendancy: (name: string | null) => void;
}

export const useTreeStore = create<TreeStoreState>((set, get) => ({
  nodes: {},
  classes: [],
  allocatedNodes: new Set(),
  selectedClass: null,
  selectedAscendancy: null,
  isLoaded: false,
  isLoading: false,
  error: null,

  loadTree: async () => {
    const { isLoaded, isLoading } = get();
    if (isLoaded || isLoading) return;

    set({ isLoading: true, error: null });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const data = require('../../assets/data/tree.json') as {
        nodes?: Record<string, TreeNode>;
        classes?: TreeClass[];
      };

      const rawNodes = data.nodes ?? {};
      const nodes: Record<number, TreeNode> = {};
      for (const [key, node] of Object.entries(rawNodes)) {
        const id = Number(key);
        if (node.name?.trim()) {
          nodes[id] = { ...node, skill: id };
        }
      }

      set({ nodes, classes: data.classes ?? [], isLoaded: true, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  toggleNode: (id: number) => {
    const prev = get().allocatedNodes;
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ allocatedNodes: next });
  },

  clearAll: () => set({ allocatedNodes: new Set() }),

  setSelectedClass: (name) => set({ selectedClass: name }),
  setSelectedAscendancy: (name) => set({ selectedAscendancy: name }),
}));

export function nodeTypePriority(node: TreeNode): number {
  if (node.isKeystone) return 0;
  if (node.isNotable) return 1;
  if (node.isMastery) return 3;
  return 2;
}

export function nodeTypeLabel(node: TreeNode): string {
  if (node.isKeystone) return 'Keystone';
  if (node.isNotable) return 'Notable';
  if (node.isMastery) return 'Mastery';
  if (node.isJewelSocket) return 'Jewel';
  return 'Normal';
}

export function nodeTypeBadgeColor(node: TreeNode): string {
  if (node.isKeystone) return COLORS.nodeKeystone;
  if (node.isNotable) return COLORS.nodeNotable;
  if (node.isMastery) return COLORS.nodeMastery;
  if (node.isJewelSocket) return COLORS.nodeJewel;
  return COLORS.nodeNormal;
}
