// Pure utilities for computing passive skill tree layout from raw tree.json data.
// All functions are called once during loadTree() and results stored in Zustand.

type RawNode = {
  id: number;
  group: number;
  orbit: number;
  orbitIndex: number;
  connections?: { id: number }[];
  classesStart?: string[];
};

type RawGroup = { x: number; y: number };

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

/**
 * Computes (x, y) screen position for every node using the PoB / GGG convention:
 *   angle starts at 12 o'clock and increases clockwise.
 *   x = group.x + sin(angle) * radius
 *   y = group.y - cos(angle) * radius
 *
 * Positions are then normalised so that the minimum coordinate in each axis is 0.
 * The normalisation offset is baked in so callers never need to know about minX/minY.
 * Call computeTreeBounds() first to obtain the offsets.
 */
export function computeNodePositions(
  nodes: Record<string, RawNode>,
  groups: Record<string, RawGroup>,
  constants: TreeConstants
): Record<number, { x: number; y: number }> {
  const { orbitRadii, skillsPerOrbit } = constants;

  // First pass: raw world coordinates
  const raw: Record<number, { x: number; y: number }> = {};
  for (const [, node] of Object.entries(nodes)) {
    const group = groups[String(node.group)];
    if (!group) continue;

    const orbit = node.orbit ?? 0;
    const orbitIndex = node.orbitIndex ?? 0;
    const radius = orbitRadii[orbit] ?? 0;
    const n = skillsPerOrbit[orbit] ?? 1;
    // angle = 0 puts the node at the top (12 o'clock), increases clockwise
    const angle = n <= 1 ? 0 : (2 * Math.PI * orbitIndex) / n;

    raw[node.id] = {
      x: group.x + Math.sin(angle) * radius,
      y: group.y - Math.cos(angle) * radius,
    };
  }

  // Find bounds for normalisation
  let minX = Infinity;
  let minY = Infinity;
  for (const pos of Object.values(raw)) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
  }
  if (!isFinite(minX)) minX = 0;
  if (!isFinite(minY)) minY = 0;

  // Second pass: normalise so all coordinates are ≥ 0
  const normalised: Record<number, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(raw)) {
    normalised[Number(id)] = { x: pos.x - minX, y: pos.y - minY };
  }

  return normalised;
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
 * Builds an undirected adjacency list: nodeId → list of all connected node IDs.
 * tree.json stores connections from each node's perspective, so we mirror them
 * to ensure both directions are present.
 */
export function computeAdjacency(
  nodes: Record<string, RawNode>
): Record<number, number[]> {
  const adj: Record<number, Set<number>> = {};

  const ensure = (id: number) => {
    if (!adj[id]) adj[id] = new Set();
  };

  for (const [, node] of Object.entries(nodes)) {
    ensure(node.id);
    for (const conn of node.connections ?? []) {
      ensure(conn.id);
      adj[node.id].add(conn.id);
      adj[conn.id].add(node.id); // mirror so both directions are available
    }
  }

  // Convert Sets to plain arrays
  const result: Record<number, number[]> = {};
  for (const [id, set] of Object.entries(adj)) {
    result[Number(id)] = Array.from(set);
  }
  return result;
}

/**
 * Builds a map from PoE2 class name to class-start node ID.
 * Uses the `classesStart` array present on the 6 hub nodes in tree.json.
 * e.g. { Ranger: 50459, Huntress: 50459, Warrior: 47175, ... }
 */
export function buildClassStartMap(
  nodes: Record<string, RawNode>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [, node] of Object.entries(nodes)) {
    if (node.classesStart) {
      for (const className of node.classesStart) {
        map[className] = node.id;
      }
    }
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
 * Lets the renderer skip the ~96% of nodes outside the visible viewport
 * by querying only the grid cells that overlap the viewport rect.
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
 * Nodes in boundary cells are included (conservative: may include a few off-screen).
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
  // Build the set that would remain after removal
  const remaining = new Set(allocatedNodes);
  remaining.delete(nodeId);
  if (remaining.size === 0) return true; // nothing left to protect

  // BFS from class start through remaining allocated nodes only
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

  // Safe only if every remaining node is still reachable from start
  return reachable.size === remaining.size;
}
