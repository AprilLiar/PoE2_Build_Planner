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
  POE2_CLASS_START_NODES,
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
  // ascendancyName is the human-readable name (e.g. "Titan").
  // In old format it comes directly from the file; in new format it is derived from ascendancyId.
  ascendancyName?: string;
  ascendancyId?: string;      // new GGG format: e.g. "Warrior1", "Druid1"
  flavourText?: string;       // new GGG format
  isKeystone?: boolean;
  isNotable?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  isClassStart?: boolean;     // true for the 6 class hub nodes (prevents anchor-node treatment)
  classesStart?: string[];    // old format only
  connections?: { id: number; orbit: number }[];  // old format only
  out?: string[];             // new format: outgoing neighbour skill IDs
  in?: string[];              // new format: incoming neighbour skill IDs
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  x?: number;                 // new format: pre-computed world coordinate
  y?: number;                 // new format: pre-computed world coordinate
}

export interface TreeClass {
  name: string;
  ascendancies: { id?: string; name: string; displayName?: string }[];
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
  jewelSlots: Set<number>;                 // skill IDs that are jewel sockets

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
  jewelSlots: new Set(),
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
        nodes?: Record<string, any>;
        classes?: any[];
        groups?: Record<string, any>;
        constants?: { orbitRadii: number[]; skillsPerOrbit: number[] };
        jewelSlots?: number[];
      };

      // PoE2 orbit geometry — present in old PoB-derived tree.json as `constants`;
      // absent from the new GGG official export, so we hardcode the known values here.
      const ORBIT_RADII    = [0, 82, 162, 335, 493, 662, 846, 251, 1080, 1322];
      const SKILLS_PER_ORBIT = [1, 12,  24,  24,  72,  72,  72,  24,   72,  144];
      const constants = data.constants ?? { orbitRadii: ORBIT_RADII, skillsPerOrbit: SKILLS_PER_ORBIT };

      // Jewel socket IDs from the new GGG export (absent in old format → empty set)
      const jewelSlots = new Set<number>(data.jewelSlots ?? []);

      // Build ascendancyId → display name map from the classes array.
      // New GGG format: class.ascendancies[].id = "Warrior1", .name = "Titan".
      const ascIdToName: Record<string, string> = {};
      for (const cls of (data.classes ?? [])) {
        for (const asc of (cls.ascendancies ?? [])) {
          if (asc.id && asc.name) ascIdToName[asc.id] = asc.name;
        }
      }

      // Set of class-start node IDs (RANGER, MARAUDER, etc.) so they aren't
      // mistakenly treated as anchor nodes (they have empty stats in the new format).
      const classStartIds = new Set(Object.values(POE2_CLASS_START_NODES));

      const rawNodes = data.nodes ?? {};
      const nodes: Record<number, TreeNode> = {};

      for (const [key, node] of Object.entries(rawNodes)) {
        // New format uses explicit `skill` field; old format uses the numeric key.
        const skillId: number = (node.skill !== undefined) ? node.skill : Number(key);
        if (!isFinite(skillId) || skillId <= 0) continue; // skip root / invalid
        if (!node.name?.trim()) continue;                  // skip unnamed connector nodes

        // Derive ascendancyName from ascendancyId (new format) or keep existing field (old)
        const ascendancyName: string | undefined =
          node.ascendancyId ? (ascIdToName[node.ascendancyId] ?? node.ascendancyName)
                             : node.ascendancyName;

        nodes[skillId] = {
          ...node,
          skill: skillId,
          ascendancyName,
          isJewelSocket: jewelSlots.has(skillId) || node.isJewelSocket,
          isClassStart: classStartIds.has(skillId),
        };
      }

      const groups = data.groups ?? {};
      const { positions: nodePositions, normOffsetX, normOffsetY } =
        computeNodePositions(rawNodes as any, groups, constants);
      const treeBounds = computeTreeBounds(nodePositions);
      const adjacency = computeAdjacency(rawNodes as any);

      // Collapse anchor nodes (visual-only placeholders with no stats) out of the
      // adjacency graph so real nodes bridged by an anchor stay reachable for BFS.
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
      const spatialGrid = buildSpatialGrid(nodePositions, 500);
      // Pass rawNodes so buildGroupData can derive isAscendancy from ascendancyId presence
      const groupData = buildGroupData(groups as any, constants, normOffsetX, normOffsetY, rawNodes as any);

      // Only expose PoE2 classes (those with ascendancies defined).
      // The GGG export also includes legacy PoE1 names (Marauder, Duelist, etc.)
      // that share start nodes with PoE2 classes but have no ascendancies.
      const classes: TreeClass[] = (data.classes ?? [])
        .filter((c: any) => c.ascendancies?.length > 0)
        .map((c: any) => ({
          name: c.name,
          ascendancies: (c.ascendancies ?? []).map((a: any) => ({
            id: a.id,
            name: a.name,
          })),
        }));

      set({
        nodes,
        classes,
        nodePositions,
        treeBounds,
        adjacency,
        classStartNodes,
        spatialGrid,
        treeConstants: constants,
        groupData,
        jewelSlots,
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
  if (node.ascendancyName || node.isAscendancyStart) return false;
  if (node.isClassStart) return false;             // class hub nodes (RANGER, etc.)
  if (node.classesStart?.length) return false;     // old format fallback
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
