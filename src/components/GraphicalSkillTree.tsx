import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useSharedValue,
  useDerivedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Path as SkiaPath,
  Rect,
  Skia,
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { useTreeStore, TreeNode } from '../store/useTreeStore';
import { queryVisibleNodes } from '../utils/treeLayout';
import { COLORS } from '../constants/colors';

const MINIMAP_SIZE = 130;
const MINIMAP_INNER = MINIMAP_SIZE - 20;
const VIEWPORT_PADDING = 0.25;
const TOOLTIP_WIDTH = 220;

interface Props {
  // Long-press detail sheet has been replaced by the inline tap tooltip
}

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };

type NodeCategory = 'keystone' | 'notable' | 'mastery' | 'ascNormal' | 'jewel' | 'normal';

const CATEGORY_STYLE: Record<NodeCategory, { color: string; r: number; outerR: number }> = {
  keystone:  { color: COLORS.nodeKeystone, r: 30, outerR: 43 },
  notable:   { color: COLORS.nodeNotable,  r: 22, outerR: 32 },
  mastery:   { color: COLORS.nodeMastery,  r: 18, outerR: 26 },
  ascNormal: { color: COLORS.nodeNormal,   r: 18, outerR: 26 },
  jewel:     { color: COLORS.nodeJewel,    r: 15, outerR: 23 },
  normal:    { color: COLORS.nodeNormal,   r: 15, outerR: 22 },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_STYLE) as NodeCategory[];

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  keystone:  'Keystone',
  notable:   'Notable',
  mastery:   'Mastery',
  ascNormal: 'Ascendancy',
  jewel:     'Jewel Socket',
  normal:    'Passive',
};

function getCategory(node: TreeNode): NodeCategory {
  if (node.isKeystone) return 'keystone';
  if (node.isNotable) return 'notable';
  if (node.isMastery) return 'mastery';
  if (node.isJewelSocket) return 'jewel';
  if (node.ascendancyName) return 'ascNormal';
  return 'normal';
}

function clamp(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, value));
}

function makeCategoryPaths(): Record<NodeCategory, SkPath> {
  return {
    keystone:  Skia.Path.Make(),
    notable:   Skia.Path.Make(),
    mastery:   Skia.Path.Make(),
    ascNormal: Skia.Path.Make(),
    jewel:     Skia.Path.Make(),
    normal:    Skia.Path.Make(),
  };
}

// ─── Inline tooltip component ────────────────────────────────────────────────

interface TooltipState {
  node: TreeNode;
  screenX: number;
  screenY: number;
}

interface NodeTooltipProps extends TooltipState {
  screenWidth: number;
  screenHeight: number;
}

function NodeTooltip({ node, screenX, screenY, screenWidth, screenHeight }: NodeTooltipProps) {
  const cat = getCategory(node);
  const color = CATEGORY_STYLE[cat].color;
  const typeLabel = CATEGORY_LABELS[cat];
  // Show up to 3 stat lines
  const stats = node.stats?.slice(0, 3) ?? [];

  // Centre the card horizontally over the tap, clamped within screen edges
  let left = screenX - TOOLTIP_WIDTH / 2;
  left = Math.max(8, Math.min(screenWidth - TOOLTIP_WIDTH - 8, left));

  // Place above the tap in the lower half of the screen, below in the upper half
  const positionStyle =
    screenY > screenHeight * 0.55
      ? { bottom: screenHeight - screenY + 18 }
      : { top: screenY + 18 };

  return (
    <View
      style={[tooltipStyles.card, { left, borderColor: color, ...positionStyle }]}
      pointerEvents="none"
    >
      <Text style={[tooltipStyles.name, { color }]} numberOfLines={1}>
        {node.name}
      </Text>
      <Text style={tooltipStyles.type}>{typeLabel}</Text>
      {stats.length > 0 && <View style={tooltipStyles.divider} />}
      {stats.map((s, i) => (
        <Text key={i} style={tooltipStyles.stat}>{s}</Text>
      ))}
    </View>
  );
}

const tooltipStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    backgroundColor: 'rgba(11, 15, 26, 0.97)',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    // borderColor supplied inline (category colour)
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
  },
  type: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  stat: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 17,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function GraphicalSkillTree(_props: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const {
    nodes,
    nodePositions,
    treeBounds,
    classStartNodes,
    allocatedNodes,
    selectedClass,
    selectedAscendancy,
    classes,
    toggleNode,
    spatialGrid,
    treeConstants,
    groupData,
    flyToNodeId,
    setFlyToNodeId,
  } = useTreeStore();

  // -------------------------------------------------------------------------
  // Fit scale: maps world coords → screen pixels at "view whole tree" zoom
  // -------------------------------------------------------------------------
  const fitScale = useMemo(() => {
    if (!treeBounds.width || !treeBounds.height) return 0.012;
    return Math.min(screenWidth / treeBounds.width, screenHeight / treeBounds.height) * 0.9;
  }, [treeBounds, screenWidth, screenHeight]);

  const fitTX = useMemo(
    () => screenWidth / 2 - (treeBounds.width / 2) * fitScale,
    [screenWidth, treeBounds.width, fitScale]
  );
  const fitTY = useMemo(
    () => screenHeight / 2 - (treeBounds.height / 2) * fitScale,
    [screenHeight, treeBounds.height, fitScale]
  );

  // Camera shared values — live on the UI thread for smooth animation
  const scale    = useSharedValue(fitScale);
  const panX     = useSharedValue(fitTX);
  const panY     = useSharedValue(fitTY);
  const savedScale = useSharedValue(fitScale);
  const savedPanX  = useSharedValue(fitTX);
  const savedPanY  = useSharedValue(fitTY);

  const screenWidthSV  = useSharedValue(screenWidth);
  const screenHeightSV = useSharedValue(screenHeight);
  useEffect(() => {
    screenWidthSV.value  = screenWidth;
    screenHeightSV.value = screenHeight;
  }, [screenWidth, screenHeight, screenWidthSV, screenHeightSV]);

  // Start zoomed in (10× fit) so nodes are immediately visible on first render
  useEffect(() => {
    if (!treeBounds.width || !treeBounds.height) {
      scale.value = fitScale; panX.value = fitTX; panY.value = fitTY;
      savedScale.value = fitScale; savedPanX.value = fitTX; savedPanY.value = fitTY;
      return;
    }
    const startScale = fitScale * 10;
    const startTX = screenWidth  / 2 - (treeBounds.width  / 2) * startScale;
    const startTY = screenHeight / 2 - (treeBounds.height / 2) * startScale;
    scale.value    = startScale; panX.value    = startTX; panY.value    = startTY;
    savedScale.value = startScale; savedPanX.value = startTX; savedPanY.value = startTY;
  }, [fitScale, fitTX, fitTY, treeBounds.width, treeBounds.height,
      screenWidth, screenHeight, scale, panX, panY, savedScale, savedPanX, savedPanY]);

  // -------------------------------------------------------------------------
  // Viewport culling — updated on gesture end (JS thread)
  // -------------------------------------------------------------------------
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const computeViewport = useCallback(
    (sc: number, tx: number, ty: number): Viewport => {
      const worldMinX = (0 - tx) / sc;
      const worldMinY = (0 - ty) / sc;
      const worldMaxX = (screenWidth  - tx) / sc;
      const worldMaxY = (screenHeight - ty) / sc;
      const padW = (worldMaxX - worldMinX) * VIEWPORT_PADDING;
      const padH = (worldMaxY - worldMinY) * VIEWPORT_PADDING;
      return {
        minX: worldMinX - padW, minY: worldMinY - padH,
        maxX: worldMaxX + padW, maxY: worldMaxY + padH,
      };
    },
    [screenWidth, screenHeight]
  );

  useEffect(() => {
    if (!fitScale || !treeBounds.width || !treeBounds.height) return;
    const startScale = fitScale * 10;
    const startTX = screenWidth  / 2 - (treeBounds.width  / 2) * startScale;
    const startTY = screenHeight / 2 - (treeBounds.height / 2) * startScale;
    setViewport(computeViewport(startScale, startTX, startTY));
  }, [fitScale, treeBounds.width, treeBounds.height, screenWidth, screenHeight, computeViewport]);

  const updateViewportJS = useCallback(() => {
    setViewport(computeViewport(scale.value, panX.value, panY.value));
  }, [computeViewport, scale, panX, panY]);

  // -------------------------------------------------------------------------
  // Ascendancy repositioning — selected ascendancy cluster is translated to
  // the centre of the main tree so it appears inline rather than at the edge.
  // -------------------------------------------------------------------------

  const mainTreeCenter = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const node of Object.values(nodes)) {
      if (node.ascendancyName) continue;
      const p = nodePositions[node.skill];
      if (!p) continue;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return isFinite(x0)
      ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
      : { x: treeBounds.width / 2, y: treeBounds.height / 2 };
  }, [nodes, nodePositions, treeBounds]);

  const ascendancyOffset = useMemo(() => {
    if (!selectedAscendancy) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const node of Object.values(nodes)) {
      if (node.ascendancyName !== selectedAscendancy) continue;
      const p = nodePositions[node.skill];
      if (!p) continue;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    if (!isFinite(x0)) return null;
    return { dx: mainTreeCenter.x - (x0 + x1) / 2, dy: mainTreeCenter.y - (y0 + y1) / 2 };
  }, [selectedAscendancy, nodes, nodePositions, mainTreeCenter]);

  const displayPositions = useMemo(() => {
    if (!ascendancyOffset || !selectedAscendancy) return nodePositions;
    const { dx, dy } = ascendancyOffset;
    const out: Record<number, { x: number; y: number }> = { ...nodePositions };
    for (const node of Object.values(nodes)) {
      if (node.ascendancyName !== selectedAscendancy) continue;
      const p = nodePositions[node.skill];
      if (p) out[node.skill] = { x: p.x + dx, y: p.y + dy };
    }
    return out;
  }, [ascendancyOffset, selectedAscendancy, nodes, nodePositions]);

  // -------------------------------------------------------------------------
  // Fly-to: search result → spring camera to that node (uses display positions
  // so searching for an ascendancy node flies to its repositioned location)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (flyToNodeId == null) return;
    const pos = displayPositions[flyToNodeId];
    if (!pos) { setFlyToNodeId(null); return; }
    const targetScale = fitScale * 20;
    const targetTX = screenWidth  / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;
    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value  = withSpring(targetTX,   { damping: 20, stiffness: 120 });
    panY.value  = withSpring(targetTY,   { damping: 20, stiffness: 120 });
    setViewport(computeViewport(targetScale, targetTX, targetTY));
    setFlyToNodeId(null);
  }, [flyToNodeId, setFlyToNodeId, displayPositions, fitScale,
      screenWidth, screenHeight, scale, panX, panY, computeViewport]);

  // -------------------------------------------------------------------------
  // Class fly-to — spring to the class start node in the main tree
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedClass) return;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return;
    const pos = nodePositions[startId]; // class start is always a main-tree node
    if (!pos) return;
    const targetScale = fitScale * 10;
    const targetTX = screenWidth  / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;
    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value  = withSpring(targetTX,   { damping: 20, stiffness: 120 });
    panY.value  = withSpring(targetTY,   { damping: 20, stiffness: 120 });
  }, [selectedClass, classStartNodes, nodePositions, fitScale,
      screenWidth, screenHeight, scale, panX, panY]);

  // -------------------------------------------------------------------------
  // Ascendancy fly-to — spring to the tree centre (where the repositioned
  // ascendancy cluster now lives) whenever the selected ascendancy changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedAscendancy || !ascendancyOffset) return;
    const targetScale = fitScale * 15;
    const targetTX = screenWidth  / 2 - mainTreeCenter.x * targetScale;
    const targetTY = screenHeight / 2 - mainTreeCenter.y * targetScale;
    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value  = withSpring(targetTX,   { damping: 20, stiffness: 120 });
    panY.value  = withSpring(targetTY,   { damping: 20, stiffness: 120 });
    setViewport(computeViewport(targetScale, targetTX, targetTY));
  }, [selectedAscendancy, ascendancyOffset, mainTreeCenter, fitScale,
      screenWidth, screenHeight, scale, panX, panY, computeViewport]);

  // -------------------------------------------------------------------------
  // Animated Group transform — UI thread, no JS bridge during gestures
  // -------------------------------------------------------------------------
  const transform = useDerivedValue(() => [
    { translateX: panX.value },
    { translateY: panY.value },
    { scale: scale.value },
  ]);

  // -------------------------------------------------------------------------
  // Non-scaling stroke widths — divide by scale so edges stay 1–3 screen px
  // regardless of zoom level (Skia equivalent of SVG vectorEffect=non-scaling-stroke)
  // -------------------------------------------------------------------------
  const edgeStrokeUnalloc = useDerivedValue(() => 1.5 / scale.value);
  const edgeStrokeAlloc   = useDerivedValue(() => 2.5 / scale.value);
  const highlightStroke   = useDerivedValue(() => 3.0 / scale.value);
  const edgeGlowStroke    = useDerivedValue(() => 10.0 / scale.value); // wide glow pass
  const orbitRingStroke   = useDerivedValue(() => 1.5 / scale.value);
  const nodeRingStroke    = useDerivedValue(() => 2.0 / scale.value);

  // -------------------------------------------------------------------------
  // Minimap viewport rect — world-coordinate positions animated on UI thread
  // -------------------------------------------------------------------------
  const minimapViewX = useDerivedValue(() => (0 - panX.value) / scale.value);
  const minimapViewY = useDerivedValue(() => (0 - panY.value) / scale.value);
  const minimapViewW = useDerivedValue(() => screenWidthSV.value  / scale.value);
  const minimapViewH = useDerivedValue(() => screenHeightSV.value / scale.value);

  // -------------------------------------------------------------------------
  // Tooltip state — shows node name, type and stats on tap
  // -------------------------------------------------------------------------
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTooltip = useCallback(() => setTooltip(null), []);

  // -------------------------------------------------------------------------
  // Gesture handlers
  // -------------------------------------------------------------------------
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1) // single-finger only — prevents pan while pinching
    .minDistance(5)
    .onStart(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
      runOnJS(clearTooltip)(); // dismiss tooltip when user starts panning
    })
    .onUpdate((e) => {
      panX.value = savedPanX.value + e.translationX;
      panY.value = savedPanY.value + e.translationY;
    })
    .onEnd(() => { runOnJS(updateViewportJS)(); });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedPanX.value  = panX.value;
      savedPanY.value  = panY.value;
      runOnJS(clearTooltip)(); // dismiss tooltip when user starts zooming
    })
    .onUpdate((e) => {
      const newScale = clamp(savedScale.value * e.scale, fitScale * 0.5, fitScale * 500);
      const ratio = newScale / savedScale.value;
      panX.value = e.focalX - (e.focalX - savedPanX.value) * ratio;
      panY.value = e.focalY - (e.focalY - savedPanY.value) * ratio;
      scale.value = newScale;
    })
    .onEnd(() => { runOnJS(updateViewportJS)(); });

  // Hit test: screen coords → nearest world-space node
  const hitTest = useCallback(
    (screenX: number, screenY: number, threshPx: number): number | null => {
      const sc = scale.value;
      const tx = panX.value;
      const ty = panY.value;
      const wx = (screenX - tx) / sc;
      const wy = (screenY - ty) / sc;
      const threshWorld = threshPx / sc;
      const threshSq    = threshWorld * threshWorld;
      let bestId: number | null = null;
      let bestDist = threshSq;
      for (const [idStr, pos] of Object.entries(displayPositions)) {
        const dx = pos.x - wx;
        const dy = pos.y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) { bestDist = d2; bestId = Number(idStr); }
      }
      return bestId;
    },
    [displayPositions, scale, panX, panY]
  );

  const handleTap = useCallback(
    (screenX: number, screenY: number) => {
      const id = hitTest(screenX, screenY, 36);
      if (id !== null) {
        // Allocate / deallocate the node
        toggleNode(id);
        // Show tooltip with node details
        const node = nodes[id];
        if (node) {
          if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
          setTooltip({ node, screenX, screenY });
          // Auto-dismiss after 2.5 s
          tooltipTimerRef.current = setTimeout(() => setTooltip(null), 2500);
        }
      } else {
        // Tap on empty space → dismiss any open tooltip
        setTooltip(null);
      }
    },
    [hitTest, toggleNode, nodes]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(handleTap)(e.x, e.y);
  });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture, tapGesture);

  // -------------------------------------------------------------------------
  // Ascendancy highlight sets
  // -------------------------------------------------------------------------
  const classAscendancyNames = useMemo(() => {
    if (!selectedClass) return new Set<string>();
    const cls = classes.find((c) => c.name === selectedClass);
    return new Set(cls?.ascendancies.map((a) => a.name) ?? []);
  }, [classes, selectedClass]);

  const highlightedAscendancies = useMemo(() => {
    if (selectedAscendancy) return new Set([selectedAscendancy]);
    if (selectedClass) return classAscendancyNames;
    return new Set<string>();
  }, [selectedAscendancy, selectedClass, classAscendancyNames]);

  const visuallyAllocated = useMemo(() => {
    if (!selectedClass) return allocatedNodes;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return allocatedNodes;
    const expanded = new Set(allocatedNodes);
    expanded.add(startId);
    return expanded;
  }, [allocatedNodes, selectedClass, classStartNodes]);

  const visibleNodeIds = useMemo(() => {
    let ids: Set<number> | null = null;
    if (spatialGrid && viewport) {
      const found = queryVisibleNodes(
        spatialGrid, viewport.minX, viewport.minY, viewport.maxX, viewport.maxY
      );
      if (found.size > 0) ids = new Set(found);
    }
    // Selected ascendancy nodes are at display positions (not their spatial-grid slots),
    // so always include them regardless of viewport.
    if (selectedAscendancy) {
      for (const node of Object.values(nodes)) {
        if (node.ascendancyName !== selectedAscendancy) continue;
        if (!ids) ids = new Set();
        ids.add(node.skill);
      }
    }
    return ids;
  }, [spatialGrid, viewport, selectedAscendancy, nodes]);

  // -------------------------------------------------------------------------
  // Group visibility — filter groups to those overlapping the current viewport
  // -------------------------------------------------------------------------
  const visibleGroups = useMemo(() => {
    if (!viewport) return groupData;
    return groupData.filter((g) => {
      const r = g.maxOrbitRadius + 200;
      return (
        g.x + r > viewport.minX && g.x - r < viewport.maxX &&
        g.y + r > viewport.minY && g.y - r < viewport.maxY
      );
    });
  }, [groupData, viewport]);

  // -------------------------------------------------------------------------
  // Orbit ring path — one circle per orbit per visible non-ascendancy group
  // -------------------------------------------------------------------------
  const orbitRingPath = useMemo(() => {
    const path = Skia.Path.Make();
    const { orbitRadii } = treeConstants;
    for (const g of visibleGroups) {
      if (g.isAscendancy) continue;
      for (const o of g.orbits) {
        const r = orbitRadii[o] ?? 0;
        if (r > 0) path.addCircle(g.x, g.y, r);
      }
    }
    return path;
  }, [visibleGroups, treeConstants]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — edges
  // -------------------------------------------------------------------------
  const { unallocEdgePath, allocEdgePath } = useMemo(() => {
    const unalloc = Skia.Path.Make();
    const alloc   = Skia.Path.Make();
    const { orbitRadii, skillsPerOrbit } = treeConstants;

    for (const node of Object.values(nodes)) {
      const fromPos = displayPositions[node.skill];
      if (!fromPos) continue;

      for (const conn of node.connections ?? []) {
        // Connections in tree.json are unidirectional — each edge is stored in only
        // one node's connection list, so no deduplication is needed or correct here.

        // Skip cross-ascendancy edges — these connect class start nodes to ascendancy
        // sub-tree starts (and vice versa) spanning ~15 000+ world units across the tree.
        const toNode = nodes[conn.id];
        const fromAsc = node.ascendancyName ?? null;
        const toAsc   = toNode?.ascendancyName ?? null;
        if (fromAsc !== toAsc) continue;

        const toPos = displayPositions[conn.id];
        if (!toPos) continue;

        if (visibleNodeIds &&
            !visibleNodeIds.has(node.skill) &&
            !visibleNodeIds.has(conn.id)) continue;

        const path = (visuallyAllocated.has(node.skill) && visuallyAllocated.has(conn.id))
          ? alloc : unalloc;

        // Same-group, same-orbit connections are arcs along the orbit ring.
        // For ascendancy nodes the group centre must be recovered from the display position
        // (which already incorporates the ascendancy offset), so the arc stays correct.
        if (
          toNode !== undefined &&
          node.group !== undefined &&
          node.group === toNode.group &&
          node.orbit !== undefined &&
          node.orbit === toNode.orbit &&
          node.orbit > 0
        ) {
          const r = orbitRadii[node.orbit] ?? 0;
          const n = skillsPerOrbit[node.orbit] ?? 1;
          const idxA = node.orbitIndex  ?? 0;
          const idxB = toNode.orbitIndex ?? 0;

          const angleA  = n <= 1 ? 0 : (2 * Math.PI * idxA) / n;
          const centerX = fromPos.x - Math.sin(angleA) * r;
          const centerY = fromPos.y + Math.cos(angleA) * r;

          const startDeg = (idxA / n) * 360 - 90;
          const endDeg   = (idxB / n) * 360 - 90;

          let sweep = endDeg - startDeg;
          if (sweep >  180) sweep -= 360;
          if (sweep < -180) sweep += 360;

          path.addArc(
            { x: centerX - r, y: centerY - r, width: 2 * r, height: 2 * r },
            startDeg,
            sweep
          );
        } else {
          path.moveTo(fromPos.x, fromPos.y);
          path.lineTo(toPos.x,   toPos.y);
        }
      }
    }
    return { unallocEdgePath: unalloc, allocEdgePath: alloc };
  }, [nodes, displayPositions, visuallyAllocated, visibleNodeIds, treeConstants]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — nodes
  // -------------------------------------------------------------------------
  const nodePaths = useMemo(() => {
    const unalloc   = makeCategoryPaths();
    const alloc     = makeCategoryPaths();
    const highlight = Skia.Path.Make();
    for (const node of Object.values(nodes)) {
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const cat = getCategory(node);
      const r   = CATEGORY_STYLE[cat].r;
      if (visuallyAllocated.has(node.skill)) {
        alloc[cat].addCircle(pos.x, pos.y, r);
      } else {
        unalloc[cat].addCircle(pos.x, pos.y, r);
      }
      if (node.ascendancyName && highlightedAscendancies.has(node.ascendancyName)) {
        highlight.addCircle(pos.x, pos.y, r + 10);
      }
    }
    return { unalloc, alloc, highlight };
  }, [nodes, displayPositions, visuallyAllocated, highlightedAscendancies, visibleNodeIds]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — node outer rings (frame effect per node type)
  // -------------------------------------------------------------------------
  const nodeRingPaths = useMemo(() => {
    const unalloc = makeCategoryPaths();
    const alloc   = makeCategoryPaths();
    for (const node of Object.values(nodes)) {
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const cat = getCategory(node);
      const outerR = CATEGORY_STYLE[cat].outerR;
      if (visuallyAllocated.has(node.skill)) {
        alloc[cat].addCircle(pos.x, pos.y, outerR);
      } else {
        unalloc[cat].addCircle(pos.x, pos.y, outerR);
      }
    }
    return { unalloc, alloc };
  }, [nodes, displayPositions, visuallyAllocated, visibleNodeIds]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — minimap (once after tree loads)
  // -------------------------------------------------------------------------
  const minimapPaths = useMemo(() => {
    const paths = makeCategoryPaths();
    for (const node of Object.values(nodes)) {
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      const cat = getCategory(node);
      const r = cat === 'keystone' ? 1400 : cat === 'notable' ? 1000 : 700;
      paths[cat].addCircle(pos.x, pos.y, r);
    }
    return paths;
  }, [nodes, displayPositions]);

  const showMinimap = treeBounds.width > 0 && treeBounds.height > 0;
  const minimapBottom = 54 + insets.bottom;
  const mmScaleX = showMinimap ? MINIMAP_INNER / treeBounds.width  : 1;
  const mmScaleY = showMinimap ? MINIMAP_INNER / treeBounds.height : 1;

  // Shared values so the minimap gesture worklet can read the current scale factors
  const mmScaleXSV = useSharedValue(mmScaleX);
  const mmScaleYSV = useSharedValue(mmScaleY);
  useEffect(() => {
    mmScaleXSV.value = mmScaleX;
    mmScaleYSV.value = mmScaleY;
  }, [mmScaleX, mmScaleY, mmScaleXSV, mmScaleYSV]);

  // Minimap padding: the inner canvas sits centred inside the outer View with this offset
  const MINIMAP_PAD = (MINIMAP_SIZE - MINIMAP_INNER) / 2; // = 10

  const minimapGesture = Gesture.Pan()
    .onBegin((e) => {
      // Convert minimap touch → world coordinate → re-centre camera
      const worldX = (e.x - MINIMAP_PAD) / mmScaleXSV.value;
      const worldY = (e.y - MINIMAP_PAD) / mmScaleYSV.value;
      panX.value = screenWidthSV.value  / 2 - worldX * scale.value;
      panY.value = screenHeightSV.value / 2 - worldY * scale.value;
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      const worldX = (e.x - MINIMAP_PAD) / mmScaleXSV.value;
      const worldY = (e.y - MINIMAP_PAD) / mmScaleYSV.value;
      panX.value = screenWidthSV.value  / 2 - worldX * scale.value;
      panY.value = screenHeightSV.value / 2 - worldY * scale.value;
    })
    .onEnd(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
      runOnJS(updateViewportJS)();
    });

  return (
    <View style={styles.container}>
      {/* Main canvas */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={transform as any}>
              {/* Layer 1: Orbit ring grid — the constellation pattern behind all nodes */}
              <SkiaPath
                path={orbitRingPath}
                color="#1E3A5F"
                style="stroke"
                strokeWidth={orbitRingStroke as any}
                opacity={0.4}
              />

              {/* Layer 3: Unallocated edges */}
              <SkiaPath
                path={unallocEdgePath}
                color={COLORS.border}
                style="stroke"
                strokeWidth={edgeStrokeUnalloc as any}
                opacity={0.75}
              />
              {/* Layer 4: Allocated edge glow — wide transparent pass */}
              <SkiaPath
                path={allocEdgePath}
                color={COLORS.gold}
                style="stroke"
                strokeWidth={edgeGlowStroke as any}
                opacity={0.15}
              />
              {/* Layer 5: Allocated edges — solid gold */}
              <SkiaPath
                path={allocEdgePath}
                color={COLORS.gold}
                style="stroke"
                strokeWidth={edgeStrokeAlloc as any}
                opacity={0.9}
              />

              {/* Layer 6: Ascendancy highlight rings */}
              <SkiaPath
                path={nodePaths.highlight}
                color={COLORS.teal}
                style="stroke"
                strokeWidth={highlightStroke as any}
                opacity={0.8}
              />

              {/* Layer 7: Unallocated node outer rings */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`ur-${cat}`}
                  path={nodeRingPaths.unalloc[cat]}
                  color={COLORS.border}
                  style="stroke"
                  strokeWidth={nodeRingStroke as any}
                  opacity={0.6}
                />
              ))}
              {/* Layer 8: Unallocated nodes filled */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`u-${cat}`}
                  path={nodePaths.unalloc[cat]}
                  color={CATEGORY_STYLE[cat].color}
                  style="fill"
                  opacity={0.45}
                />
              ))}

              {/* Layer 9: Allocated node outer rings — category colour for glow effect */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`ar-${cat}`}
                  path={nodeRingPaths.alloc[cat]}
                  color={CATEGORY_STYLE[cat].color}
                  style="stroke"
                  strokeWidth={nodeRingStroke as any}
                  opacity={0.9}
                />
              ))}
              {/* Layer 10: Allocated nodes filled */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`a-${cat}`}
                  path={nodePaths.alloc[cat]}
                  color={CATEGORY_STYLE[cat].color}
                  style="fill"
                />
              ))}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>

      {/* Minimap — touch/drag to pan the main camera (MOBA-style) */}
      {showMinimap && (
        <GestureDetector gesture={minimapGesture}>
          <View style={[styles.minimap, { bottom: minimapBottom }]}>
            <Canvas style={{ width: MINIMAP_INNER, height: MINIMAP_INNER }}>
              <Group transform={[{ scaleX: mmScaleX }, { scaleY: mmScaleY }]}>
                {CATEGORY_KEYS.map(cat => (
                  <SkiaPath
                    key={cat}
                    path={minimapPaths[cat]}
                    color={CATEGORY_STYLE[cat].color}
                    opacity={0.65}
                  />
                ))}
                <Rect
                  x={minimapViewX as any}
                  y={minimapViewY as any}
                  width={minimapViewW as any}
                  height={minimapViewH as any}
                  color="rgba(201,168,76,0.06)"
                />
                <Rect
                  x={minimapViewX as any}
                  y={minimapViewY as any}
                  width={minimapViewW as any}
                  height={minimapViewH as any}
                  color={COLORS.gold}
                  style="stroke"
                  strokeWidth={500}
                  opacity={0.85}
                />
              </Group>
            </Canvas>
          </View>
        </GestureDetector>
      )}

      {/* Node tooltip — pointerEvents="none" so gestures pass through */}
      {tooltip && (
        <NodeTooltip
          node={tooltip.node}
          screenX={tooltip.screenX}
          screenY={tooltip.screenY}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  minimap: {
    position: 'absolute',
    right: 12,
    width: MINIMAP_SIZE,
    height: MINIMAP_SIZE,
    backgroundColor: 'rgba(10, 14, 26, 0.88)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
