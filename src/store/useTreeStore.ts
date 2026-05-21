import { create } from 'zustand';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

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
  isLoaded: boolean;
  error: string | null;
  loadTree: () => Promise<void>;
  toggleNode: (id: number) => void;
  clearAll: () => void;
}

export const useTreeStore = create<TreeStoreState>((set, get) => ({
  nodes: {},
  classes: [],
  allocatedNodes: new Set(),
  isLoaded: false,
  error: null,

  loadTree: async () => {
    if (get().isLoaded) return;
    try {
      const [asset] = await Asset.loadAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../assets/data/tree.json')
      );
      if (!asset.localUri) {
        throw new Error('tree.json asset could not be resolved to a local URI');
      }
      const jsonString = await FileSystem.readAsStringAsync(asset.localUri);
      const data = JSON.parse(jsonString) as {
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

      set({ nodes, classes: data.classes ?? [], isLoaded: true, error: null });
    } catch (err) {
      set({ error: (err as Error).message });
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
  if (node.isKeystone) return '#C9A84C';
  if (node.isNotable) return '#3B82F6';
  if (node.isMastery) return '#8888FF';
  if (node.isJewelSocket) return '#10B981';
  return '#94A3B8';
}
