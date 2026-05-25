import { create } from 'zustand';
import { COLORS } from '../constants/colors';
import {
  computeNodePositions,
  computeTreeBounds,
  computeAdjacency,
  buildClassStartMap,
  buildSpatialGrid,
  buildGroupData,
  canAllocate,
  canDeallocate,
  TreeBounds,
  SpatialGrid,
  GroupData,
} from '../utils/treeLayout';

// Re-export helpers so screens can import them from one place
export { canAllocate, canDeallocate } from '../utils/treeLayout';
export type { GroupData } from '../utils/treeLayout';

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
  spatialGrid: SpatialGrid | null;         // grid index for viewport culling
  treeConstants: { orbitRadii: number[]; skillsPerOrbit: number[] }; // for arc rendering
  groupData: GroupData[];                  // group centers + orbit radii for background rendering

  // Camera fly-to: set a node ID to trigger the canvas to spring-animate to it
  flyToNodeId: number | null;
  setFlyToNodeId: (id: number | null) => void;

  // Persistent search filters — each query is a chip on the tree overlay
  searchFilters: Array<{ id: string; query: string }>;
  // Logical connectives between adjacent filters (length = searchFilters.length - 1)
  searchConnectives: Array<'AND' | 'OR'>;
  // Live query while the search modal is open — drives the real-time glow preview
  liveSearchQuery: string;
  addSearchFilter: (query: string) => void;
  removeSearchFilter: (id: string) => void;
  toggleSearchConnective: (index: number) => void;
  setLiveSearchQuery: (q: string) => void;

  loadTree: () => Promise<void>;
  toggleNode: (id: number) => void;
  clearAll: () => void;
  setAllocatedNodes: (nodes: Set<number>) => void;
  setSelectedClass: (name: string | null) => void;
  setSelectedAscendancy: (name: string | null) => void;
}

const EMPTY_BOUNDS: TreeBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

export const useTreeStore = create<TreeStoreState>((set, get) => ({
  nodes: {},
  classes: [],
  allocatedNodes: new Set(),
  selectedClass: 'Warrior',
  selectedAscendancy: 'Titan',
  isLoaded: false,
  isLoading: false,
  error: null,

  nodePositions: {},
  treeBounds: EMPTY_BOUNDS,
  adjacency: {},
  classStartNodes: {},
  spatialGrid: null,
  treeConstants: { orbitRadii: [], skillsPerOrbit: [] },
  groupData: [],
  flyToNodeId: null,
  searchFilters: [],
  searchConnectives: [],
  liveSearchQuery: '',

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

      const { positions: nodePositions, normOffsetX, normOffsetY } =
        computeNodePositions(rawNodes as any, groups, constants);
      const treeBounds = computeTreeBounds(nodePositions);
      const adjacency = computeAdjacency(rawNodes as any);

      // Collapse anchor nodes (no-stat placeholders) out of the adjacency so that
      // real nodes on either side of an anchor remain reachable for allocation BFS.
      const anchorIds = new Set<number>(
        Object.values(nodes).filter(isAnchorNode).map((n) => n.skill)
      );
      for (const anchorId of anchorIds) {
        const neighbors = (adjacency[anchorId] ?? []).filter((n) => !anchorIds.has(n));
        for (let i = 0; i < neighbors.length; i++) {
          for (let j = i + 1; j < neighbors.length; j++) {
            const a = neighbors[i], b = neighbors[j];
            if (!adjacency[a]) adjacency[a] = [];
            if (!adjacency[b]) adjacency[b] = [];
            if (!adjacency[a].includes(b)) adjacency[a].push(b);
            if (!adjacency[b].includes(a)) adjacency[b].push(a);
          }
        }
      }

      const classStartNodes = buildClassStartMap(rawNodes as any);
      // Build a 500-world-unit grid for fast viewport culling
      const spatialGrid = buildSpatialGrid(nodePositions, 500);
      // Group centers + orbit radii for background ring rendering
      const groupData = buildGroupData(groups as any, constants, normOffsetX, normOffsetY);

      set({
        nodes,
        classes: data.classes ?? [],
        nodePositions,
        treeBounds,
        adjacency,
        classStartNodes,
        spatialGrid,
        treeConstants: constants,
        groupData,
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
  setAllocatedNodes: (nodes) => set({ allocatedNodes: nodes }),

  setSelectedClass: (name) => set({ selectedClass: name }),
  setSelectedAscendancy: (name) => set({ selectedAscendancy: name }),
  setFlyToNodeId: (id) => set({ flyToNodeId: id }),

  addSearchFilter: (query) => {
    const q = query.trim();
    if (!q) return;
    const { searchFilters, searchConnectives } = get();
    const newFilter = { id: String(Date.now()), query: q };
    const newConnectives: Array<'AND' | 'OR'> =
      searchFilters.length > 0 ? [...searchConnectives, 'AND'] : [];
    set({ searchFilters: [...searchFilters, newFilter], searchConnectives: newConnectives });
  },

  removeSearchFilter: (id) => {
    const { searchFilters, searchConnectives } = get();
    const idx = searchFilters.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const newFilters = searchFilters.filter((f) => f.id !== id);
    const newConnectives = [...searchConnectives];
    // Remove the connective touching this filter: at idx, or idx-1 if it's the last
    if (newConnectives.length > 0) {
      newConnectives.splice(Math.min(idx, newConnectives.length - 1), 1);
    }
    set({ searchFilters: newFilters, searchConnectives: newConnectives });
  },

  toggleSearchConnective: (index) => {
    const { searchConnectives } = get();
    const next = [...searchConnectives];
    next[index] = next[index] === 'AND' ? 'OR' : 'AND';
    set({ searchConnectives: next });
  },

  setLiveSearchQuery: (q) => set({ liveSearchQuery: q }),
}));

// --- Pure helper functions exported for use in components ---

/** Nodes with no stats and no special type are art-only anchors — invisible and non-interactive. */
export function isAnchorNode(node: TreeNode): boolean {
  if (node.isKeystone || node.isNotable || node.isJewelSocket) return false;
  if (node.ascendancyName) return false;
  if (node.classesStart?.length) return false;
  return !node.stats || node.stats.length === 0;
}

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
