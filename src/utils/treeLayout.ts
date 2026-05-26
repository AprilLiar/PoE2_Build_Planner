// Pure utilities for computing passive skill tree layout from raw tree.json data.
// All functions are called once during loadTree() and results stored in Zustand.

type RawNode = {
  id?: number | string | null;
  skill?: number;
  group: number;
  orbit: number;
  orbitIndex: number;
  // New GGG export format (pre-computed coords, out/in adjacency)
  x?: number;
  y?: number;
  out?: string[];
  in?: string[];
  ascendancyId?: string;
  isAscendancyStart?: boolean;
  // Old PoB-derived format (computed coords from groups + constants)
  connections?: { id: number }[];
  classesStart?: string[];
};

type RawGroup = { x: number; y: number };

type RawGroupFull = {
  id?: number;
  x: number;
  y: number;
  orbits?: number[];
  isAscendancy?: boolean;
  nodes?: string[];
};

export interface GroupData {
  id: number;
  x: number;           // normalized world coordinate (same offset as nodePositions)
  y: number;
  orbits: number[];    // orbit indices used by this group
  maxOrbitRadius: number;
  isAscendancy: boolean;
}

type TreeConstants = {
  orbitRadii: number[];
  skillsPerOrbit: number[];
};

export type TreeBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

// PoE2 class start node IDs — stable across tree updates.
// Each pair of PoE2/legacy names shares the same start node.
export const POE2_CLASS_START_NODES: Record<string, number> = {
  Ranger: 50459,    Huntress: 50459,
  Marauder: 47175,  Warrior: 47175,
  Duelist: 50986,   Mercenary: 50986,
  Templar: 61525,   Druid: 61525,
  Witch: 54447,     Sorceress: 54447,
  Shadow: 44683,    Monk: 44683,
};

/**
 * Computes (x, y) screen position for every node.
 *
 * New GGG export format: nodes carry pre-computed x/y → use them directly.
 * Old PoB format: derive position from group center + orbit formula.
 *
 * Positions are normalised so the minimum coordinate in each axis is 0.
 */
export function computeNodePositions(
  nodes: Record<string, RawNode>,
  groups: Record<string, RawGroup>,
  constants: TreeConstants
): { positions: Record<number, { x: number; y: number }>; normOffsetX: number; normOffsetY: number } {
  const { orbitRadii, skillsPerOrbit } = constants;

  const raw: Record<number, { x: number; y: number }> = {};
  for (const [key, node] of Object.entries(nodes)) {
    // Use explicit skill field when available (new format); fall back to numeric key (old format)
    const skillId = node.skill ?? Number(key);
    if (!isFinite(skillId) || skillId <= 0) continue; // skip root node and invalid entries

    if (node.x !== undefined && node.y !== undefined) {
      // New format: GGG pre-computed world coordinates
      raw[skillId] = { x: node.x, y: node.y };
    } else {
      // Old format: derive from group center + orbit geometry
      const group = groups[String(node.group)];
      if (!group) continue;

      const orbit = node.orbit ?? 0;
      const orbitIndex = node.orbitIndex ?? 0;
      const radius = orbitRadii[orbit] ?? 0;
      const n = skillsPerOrbit[orbit] ?? 1;
      // angle = 0 puts node at 12 o'clock, increases clockwise
      const angle = n <= 1 ? 0 : (2 * Math.PI * orbitIndex) / n;

      raw[skillId] = {
        x: group.x + Math.sin(angle) * radius,
        y: group.y - Math.cos(angle) * radius,
      };
    }
  }

  // Find bounds for normalisation
  let minX = Infinity;
  let minY = Infinity;
  for (const pos of Object.values(raw)) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; }

  // Normalise so all coordinates are ≥ 0
  const positions: Record<number, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(raw)) {
    positions[Number(id)] = { x: pos.x - minX, y: pos.y - minY };
  }

  return { positions, normOffsetX: minX, normOffsetY: minY };
}

/**
 * Builds the group center + orbit metadata array using the same normalization
 * offset that was applied to node positions.
 *
 * Accepts an optional `nodes` map (new GGG format) to derive `isAscendancy`
 * from whether any of the group's nodes carry an `ascendancyId`.
 */
export function buildGroupData(
  groups: Record<string, RawGroupFull>,
  constants: TreeConstants,
  normOffsetX: number,
  normOffsetY: number,
  nodes?: Record<string, RawNode>,
): GroupData[] {
  const { orbitRadii } = constants;

  // Pre-build a group → isAscendancy map from node ascendancyId fields (new format)
  const groupHasAscendancy: Record<string, boolean> = {};
  if (nodes) {
    for (const node of Object.values(nodes)) {
      if (node.ascendancyId) {
        groupHasAscendancy[String(node.group)] = true;
      }
    }
  }

  const result: GroupData[] = [];
  for (const [gid, g] of Object.entries(groups)) {
    const orbits = g.orbits ?? [0];
    const maxOrbitRadius = Math.max(...orbits.map(o => orbitRadii[o] ?? 0));
    if (maxOrbitRadius <= 0) continue;
    result.push({
      id: g.id ?? Number(gid),
      x: g.x - normOffsetX,
      y: g.y - normOffsetY,
      orbits,
      maxOrbitRadius,
      isAscendancy: g.isAscendancy ?? groupHasAscendancy[gid] ?? false,
    });
  }
  return result;
}

/**
 * Returns axis-aligned bounding box of all computed positions.
 * width/height give the full canvas size needed to contain all nodes.
 */
export function computeTreeBounds(
  positions: Record<number, { x: number; y: number }>
): TreeBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pos of Object.values(positions)) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  }

  if (!isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0; }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Builds an undirected adjacency list: nodeId → connected node IDs.
 *
 * New GGG format: connections are in `out` string arrays (numeric skill IDs).
 * Old PoB format: connections are in `connections: [{id}]` arrays.
 */
export function computeAdjacency(
  nodes: Record<string, RawNode>
): Record<number, number[]> {
  const adj: Record<number, Set<number>> = {};

  const ensure = (id: number) => {
    if (!adj[id]) adj[id] = new Set();
  };

  for (const [key, node] of Object.entries(nodes)) {
    const skillId = node.skill ?? Number(key);
    if (!isFinite(skillId) || skillId <= 0) continue; // skip root node
    ensure(skillId);

    if (node.out !== undefined) {
      // New GGG format: out[] contains numeric skill ID strings
      for (const connStr of node.out) {
        const connId = Number(connStr);
        if (!isFinite(connId) || connId <= 0) continue; // skip 'root' and invalid
        ensure(connId);
        adj[skillId].add(connId);
        adj[connId].add(skillId); // mirror for undirected traversal
      }
    } else {
      // Old PoB format: connections array
      for (const conn of node.connections ?? []) {
        ensure(conn.id);
        adj[skillId].add(conn.id);
        adj[conn.id].add(skillId);
      }
    }
  }

  const result: Record<number, number[]> = {};
  for (const [id, set] of Object.entries(adj)) {
    result[Number(id)] = Array.from(set);
  }
  return result;
}

/**
 * Builds a map from PoE2 class name to class-start node ID.
 *
 * Old format: reads `classesStart` arrays from hub nodes.
 * New format (no classesStart): falls back to the hardcoded POE2_CLASS_START_NODES map.
 */
export function buildClassStartMap(
  nodes: Record<string, RawNode>
): Record<string, number> {
  const map: Record<string, number> = {};

  for (const [key, node] of Object.entries(nodes)) {
    if (node.classesStart?.length) {
      const skillId = node.skill ?? Number(key);
      for (const className of node.classesStart) {
        map[className] = skillId;
      }
    }
  }

  // If nothing found (new format), return the stable hardcoded map
  if (Object.keys(map).length === 0) {
    return { ...POE2_CLASS_START_NODES };
  }

  return map;
}

/**
 * Returns true if nodeId can be allocated given the current state.
 * Rule: at least one of its neighbours must be the class start node OR already allocated.
 */
export function canAllocate(
  nodeId: number,
  allocatedNodes: Set<number>,
  adjacency: Record<number, number[]>,
  startNodeId: number
): boolean {
  const neighbours = adjacency[nodeId] ?? [];
  for (const n of neighbours) {
    if (n === startNodeId || allocatedNodes.has(n)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Spatial index — grid-based lookup for viewport culling
// ---------------------------------------------------------------------------

export type SpatialGrid = {
  cellSize: number;
  cells: Record<string, number[]>; // "gridX,gridY" → list of node IDs in that cell
};

/**
 * Builds a uniform-grid spatial index from node world positions.
 * Each cell covers cellSize × cellSize world units (~500 is a good default).
 */
export function buildSpatialGrid(
  positions: Record<number, { x: number; y: number }>,
  cellSize: number = 500
): SpatialGrid {
  const cells: Record<string, number[]> = {};
  for (const [idStr, pos] of Object.entries(positions)) {
    const gx = Math.floor(pos.x / cellSize);
    const gy = Math.floor(pos.y / cellSize);
    const key = `${gx},${gy}`;
    if (!cells[key]) cells[key] = [];
    cells[key].push(Number(idStr));
  }
  return { cellSize, cells };
}

/**
 * Returns the set of node IDs whose grid cells overlap the given viewport rect.
 */
export function queryVisibleNodes(
  grid: SpatialGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): Set<number> {
  const { cellSize, cells } = grid;
  const gxMin = Math.floor(minX / cellSize);
  const gyMin = Math.floor(minY / cellSize);
  const gxMax = Math.floor(maxX / cellSize);
  const gyMax = Math.floor(maxY / cellSize);

  const visible = new Set<number>();
  for (let gx = gxMin; gx <= gxMax; gx++) {
    for (let gy = gyMin; gy <= gyMax; gy++) {
      const ids = cells[`${gx},${gy}`];
      if (ids) {
        for (const id of ids) visible.add(id);
      }
    }
  }
  return visible;
}

/**
 * Returns true if nodeId can be safely removed without disconnecting any other
 * allocated node from the class start.
 * Uses BFS through the remaining allocated nodes starting from startNodeId.
 */
export function canDeallocate(
  nodeId: number,
  allocatedNodes: Set<number>,
  adjacency: Record<number, number[]>,
  startNodeId: number
): boolean {
  const remaining = new Set(allocatedNodes);
  remaining.delete(nodeId);
  if (remaining.size === 0) return true;

  const reachable = new Set<number>();
  const queue: number[] = [startNodeId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const neighbour of adjacency[cur] ?? []) {
      if (remaining.has(neighbour) && !reachable.has(neighbour)) {
        reachable.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  return reachable.size === remaining.size;
}
