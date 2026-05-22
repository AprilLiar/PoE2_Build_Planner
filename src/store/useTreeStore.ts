import { create } from 'zustand';
import { COLORS } from '../constants/colors';
import {
  computeNodePositions,
  computeTreeBounds,
  computeAdjacency,
  buildClassStartMap,
  canAllocate,
  canDeallocate,
  TreeBounds,
} from '../utils/treeLayout';

// Re-export helpers so screens can import them from one place
export { canAllocate, canDeallocate } from '../utils/treeLayout';

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
  isAscendancyStart?: boolean;
  classesStart?: string[];
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

  // Layout data computed once at load time
  nodePositions: Record<number, { x: number; y: number }>;
  treeBounds: TreeBounds;
  adjacency: Record<number, number[]>;
  classStartNodes: Record<string, number>; // PoE2 class name → start node ID

  loadTree: () => Promise<void>;
  toggleNode: (id: number) => void;
  clearAll: () => void;
  setSelectedClass: (name: string | null) => void;
  setSelectedAscendancy: (name: string | null) => void;
}

const EMPTY_BOUNDS: TreeBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

export const useTreeStore = create<TreeStoreState>((set, get) => ({
  nodes: {},
  classes: [],
  allocatedNodes: new Set(),
  selectedClass: null,
  selectedAscendancy: null,
  isLoaded: false,
  isLoading: false,
  error: null,

  nodePositions: {},
  treeBounds: EMPTY_BOUNDS,
  adjacency: {},
  classStartNodes: {},

  loadTree: async () => {
    const { isLoaded, isLoading } = get();
    if (isLoaded || isLoading) return;

    set({ isLoading: true, error: null });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const data = require('../../assets/data/tree.json') as {
        nodes?: Record<string, TreeNode>;
        classes?: TreeClass[];
        groups?: Record<string, { x: number; y: number }>;
        constants?: { orbitRadii: number[]; skillsPerOrbit: number[] };
      };

      // Build typed node map, keyed by the numeric node id
      const rawNodes = data.nodes ?? {};
      const nodes: Record<number, TreeNode> = {};
      for (const [key, node] of Object.entries(rawNodes)) {
        const id = Number(key);
        if (node.name?.trim()) {
          nodes[id] = { ...node, skill: id };
        }
      }

      // Compute spatial layout data from groups + constants
      const groups = data.groups ?? {};
      const constants = data.constants ?? { orbitRadii: [], skillsPerOrbit: [] };

      const nodePositions = computeNodePositions(rawNodes as any, groups, constants);
      const treeBounds = computeTreeBounds(nodePositions);
      const adjacency = computeAdjacency(rawNodes as any);
      const classStartNodes = buildClassStartMap(rawNodes as any);

      set({
        nodes,
        classes: data.classes ?? [],
        nodePositions,
        treeBounds,
        adjacency,
        classStartNodes,
        isLoaded: true,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  toggleNode: (id: number) => {
    const { allocatedNodes, adjacency, classStartNodes, selectedClass } = get();
    const startNodeId = selectedClass ? classStartNodes[selectedClass] : undefined;

    if (allocatedNodes.has(id)) {
      // --- De-allocation ---
      // If a class is selected, enforce BFS connectivity check
      if (startNodeId !== undefined) {
        if (!canDeallocate(id, allocatedNodes, adjacency, startNodeId)) return;
      }
      const next = new Set(allocatedNodes);
      next.delete(id);
      set({ allocatedNodes: next });
    } else {
      // --- Allocation ---
      // If a class is selected, node must be adjacent to start or an allocated node
      if (startNodeId !== undefined) {
        if (!canAllocate(id, allocatedNodes, adjacency, startNodeId)) return;
      }
      const next = new Set(allocatedNodes);
      next.add(id);
      set({ allocatedNodes: next });
    }
  },

  clearAll: () => set({ allocatedNodes: new Set() }),

  setSelectedClass: (name) => set({ selectedClass: name }),
  setSelectedAscendancy: (name) => set({ selectedAscendancy: name }),
}));

// --- Pure helper functions exported for use in components ---

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

/** Radius in world units for SVG rendering */
export function nodeRadius(node: TreeNode): number {
  if (node.isKeystone) return 30;
  if (node.isNotable) return 22;
  if (node.isMastery) return 18;
  if (node.isJewelSocket) return 15;
  if (node.ascendancyName) return 18;
  return 15;
}
