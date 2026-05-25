import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useSharedValue,
  useDerivedValue,
  withSpring,
  withRepeat,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  ImageShader,
  Path as SkiaPath,
  Rect,
  Skia,
  useImage,
} from '@shopify/react-native-skia';
import type { SkPath, SkImage } from '@shopify/react-native-skia';
import { useTreeStore, TreeNode, isAnchorNode } from '../store/useTreeStore';
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
  keystone:  { color: COLORS.nodeKeystone, r: 30, outerR: 50 }, // large hex — needs extra clearance
  notable:   { color: COLORS.nodeNotable,  r: 22, outerR: 34 },
  mastery:   { color: COLORS.nodeMastery,  r: 18, outerR: 26 },
  ascNormal: { color: COLORS.nodeNormal,   r: 18, outerR: 26 },
  jewel:     { color: COLORS.nodeJewel,    r: 16, outerR: 26 }, // diamond corner-to-corner r
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

// ─── Shape helpers ────────────────────────────────────────────────────────────

/** Pointy-top regular hexagon — matches the PoE2 keystone frame silhouette. */
function addHexagon(path: SkPath, cx: number, cy: number, r: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2; // start vertex at 12 o'clock
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.close();
}

/** Axis-aligned diamond (square rotated 45°) — matches the PoE2 jewel socket shape. */
function addDiamond(path: SkPath, cx: number, cy: number, r: number): void {
  path.moveTo(cx,     cy - r);
  path.lineTo(cx + r, cy    );
  path.lineTo(cx,     cy + r);
  path.lineTo(cx - r, cy    );
  path.close();
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
  const stats = node.stats ?? [];

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
    maxHeight: 320,
    backgroundColor: 'rgba(11, 15, 26, 0.97)',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    overflow: 'hidden',
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
    searchFilters,
    searchConnectives,
    liveSearchQuery,
  } = useTreeStore();

  // ── Texture images (all static requires — Metro resolves at bundle time) ──
  const bgTileImg  = useImage(require('../../assets/poe2/tree/background/tree-background.png'));
  const groupBg104 = useImage(require('../../assets/poe2/tree/group-bgs/group-background_104_104.png'));
  const groupBg152 = useImage(require('../../assets/poe2/tree/group-bgs/group-background_152_156.png'));
  const groupBg220 = useImage(require('../../assets/poe2/tree/group-bgs/group-background_220_224.png'));
  const groupBg360 = useImage(require('../../assets/poe2/tree/group-bgs/group-background_360_360.png'));
  const groupBg468 = useImage(require('../../assets/poe2/tree/group-bgs/group-background_468_468.png'));

  // Character orbit ring images — orbit 0 is a 1435×29 connection-line strip, not a ring; skip it
  const orbitN1 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-1.png'));
  const orbitN2 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-2.png'));
  const orbitN3 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-3.png'));
  const orbitN4 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-4.png'));
  const orbitN5 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-5.png'));
  const orbitN6 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-6.png'));
  const orbitN7 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-7.png'));
  const orbitN8 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-8.png'));
  const orbitN9 = useImage(require('../../assets/poe2/tree/orbits/character-orbit-normal-9.png'));

  // Node frame textures — extracted via scripts/extract_node_frames.py
  const frameNormalAlloc    = useImage(require('../../assets/poe2/tree/node-frames-extracted/normal-allocated.png'));
  const frameNormalUnalloc  = useImage(require('../../assets/poe2/tree/node-frames-extracted/normal-unallocated.png'));
  const frameNotableAlloc   = useImage(require('../../assets/poe2/tree/node-frames-extracted/notable-allocated.png'));
  const frameNotableUnalloc = useImage(require('../../assets/poe2/tree/node-frames-extracted/notable-unallocated.png'));
  const frameJewelAlloc     = useImage(require('../../assets/poe2/tree/node-frames-extracted/jewel-allocated.png'));
  const frameJewelUnalloc   = useImage(require('../../assets/poe2/tree/node-frames-extracted/jewel-unallocated.png'));
  const frameKsAlloc        = useImage(require('../../assets/poe2/tree/node-frames-extracted/keystone-allocated.png'));
  const frameKsUnalloc      = useImage(require('../../assets/poe2/tree/node-frames-extracted/keystone-unallocated.png'));

  // Index by tree orbit number (0 → null = skip).
  // file-N px size ≈ orbit world radius; file-1 is largest (1333px) → orbit-9 (1322wu), file-9 smallest (91px) → orbit-1 (82wu).
  // Orbit-7 (251wu) breaks numerical order in tree.json; file-7 (263px) is the closest match.
  const orbitNImgs = useMemo(
    () => [null, orbitN9, orbitN8, orbitN6, orbitN5, orbitN4, orbitN3, orbitN7, orbitN2, orbitN1],
    [orbitN1, orbitN2, orbitN3, orbitN4, orbitN5, orbitN6, orbitN7, orbitN8, orbitN9],
  );

  // Index by max orbit in group → closest-fitting circular background texture.
  // Orbit radii (world units): 1=82, 2=162, 7=251, 3=335, 4=493, 5=662, 6=846, 8=1080, 9=1322
  const groupBgByOrbit = useMemo(
    () => [
      null,       // 0 — class-start single node, no group background
      groupBg104, // 1 — r=82   (104px bg, 1.3× stretch)
      groupBg152, // 2 — r=162  (152px bg, ~0.94× — closest available)
      groupBg360, // 3 — r=335  (360px bg, 2.1× — better than 208px at 3.7×)
      groupBg468, // 4 — r=493  (468px bg, 1.9× stretch)
      groupBg468, // 5 — r=662
      groupBg468, // 6 — r=846
      groupBg220, // 7 — r=251  (220px bg, 2.6× — better than 160px at 3.6×)
      groupBg468, // 8 — r=1080
      groupBg468, // 9 — r=1322
    ],
    [groupBg104, groupBg152, groupBg220, groupBg360, groupBg468],
  );

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
  const edgeStrokeUnalloc    = useDerivedValue(() => 1.5  / scale.value);
  const edgeStrokeAlloc      = useDerivedValue(() => 2.5  / scale.value);
  const highlightStroke      = useDerivedValue(() => 3.0  / scale.value);
  const edgeGlowStroke       = useDerivedValue(() => 10.0 / scale.value);
  const nodeRingStroke       = useDerivedValue(() => 2.0  / scale.value); // normal / mastery / asc
  const keystoneRingStroke   = useDerivedValue(() => 5.0  / scale.value); // heavy hex frame
  const notableRingStroke    = useDerivedValue(() => 3.5  / scale.value);
  const jewelRingStroke      = useDerivedValue(() => 3.0  / scale.value);

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
        const n = nodes[Number(idStr)];
        if (!n || isAnchorNode(n)) continue;
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
  // SKIA PATH BUILDING — edges
  // -------------------------------------------------------------------------
  const { unallocEdgePath, allocEdgePath } = useMemo(() => {
    const unalloc = Skia.Path.Make();
    const alloc   = Skia.Path.Make();
    const { orbitRadii, skillsPerOrbit } = treeConstants;

    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node)) continue;
      const fromPos = displayPositions[node.skill];
      if (!fromPos) continue;

      for (const conn of node.connections ?? []) {
        // Connections in tree.json are unidirectional — each edge is stored in only
        // one node's connection list, so no deduplication is needed or correct here.

        const toNode = nodes[conn.id];
        // Skip edges to/from anchor nodes
        if (!toNode || isAnchorNode(toNode)) continue;

        // Skip cross-ascendancy edges — these connect class start nodes to ascendancy
        // sub-tree starts (and vice versa) spanning ~15 000+ world units across the tree.
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
      if (isAnchorNode(node)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const cat    = getCategory(node);
      const r      = CATEGORY_STYLE[cat].r;
      const target = visuallyAllocated.has(node.skill) ? alloc : unalloc;
      if (cat === 'keystone') {
        addHexagon(target[cat], pos.x, pos.y, r);
      } else if (cat === 'jewel') {
        addDiamond(target[cat], pos.x, pos.y, r);
      } else {
        target[cat].addCircle(pos.x, pos.y, r);
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
      if (isAnchorNode(node)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const cat    = getCategory(node);
      const outerR = CATEGORY_STYLE[cat].outerR;
      const target = visuallyAllocated.has(node.skill) ? alloc : unalloc;
      if (cat === 'keystone') {
        addHexagon(target[cat], pos.x, pos.y, outerR);
      } else if (cat === 'jewel') {
        addDiamond(target[cat], pos.x, pos.y, outerR);
      } else {
        target[cat].addCircle(pos.x, pos.y, outerR);
      }
    }
    return { unalloc, alloc };
  }, [nodes, displayPositions, visuallyAllocated, visibleNodeIds]);

  // Per-node frame texture data — resolved on JS thread after each viewport update.
  // mastery and ascNormal nodes use the normal frame (no dedicated textures extracted).
  const nodeFrameData = useMemo(() => {
    const entries: Array<{ nodeId: number; x: number; y: number; size: number; img: SkImage }> = [];
    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const cat     = getCategory(node);
      const isAlloc = visuallyAllocated.has(node.skill);
      const outerR  = CATEGORY_STYLE[cat].outerR;
      let img: SkImage | null;
      switch (cat) {
        case 'keystone': img = isAlloc ? frameKsAlloc      : frameKsUnalloc;      break;
        case 'notable':  img = isAlloc ? frameNotableAlloc : frameNotableUnalloc; break;
        case 'jewel':    img = isAlloc ? frameJewelAlloc   : frameJewelUnalloc;   break;
        default:         img = isAlloc ? frameNormalAlloc  : frameNormalUnalloc;  break;
      }
      if (!img) continue;
      entries.push({ nodeId: node.skill, x: pos.x - outerR, y: pos.y - outerR, size: outerR * 2, img });
    }
    return entries;
  }, [
    nodes, displayPositions, visibleNodeIds, visuallyAllocated,
    frameNormalAlloc, frameNormalUnalloc,
    frameNotableAlloc, frameNotableUnalloc,
    frameJewelAlloc, frameJewelUnalloc,
    frameKsAlloc, frameKsUnalloc,
  ]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — keystone soft glow (large transparent circle behind
  // each allocated keystone to give it a halo / aura effect)
  // -------------------------------------------------------------------------
  const keystoneGlowPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const node of Object.values(nodes)) {
      if (!node.isKeystone) continue;
      if (!visuallyAllocated.has(node.skill)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      path.addCircle(pos.x, pos.y, CATEGORY_STYLE.keystone.outerR * 2.2);
    }
    return path;
  }, [nodes, displayPositions, visuallyAllocated, visibleNodeIds]);

  // -------------------------------------------------------------------------
  // SEARCH HIGHLIGHT — compute matching node IDs from persistent filters
  // and the live query while the modal is open
  // -------------------------------------------------------------------------

  // Helper: returns the Set of node IDs whose name contains the given query string
  const matchNodes = useCallback((q: string): Set<number> => {
    const lower = q.trim().toLowerCase();
    if (!lower) return new Set();
    const ids = new Set<number>();
    for (const node of Object.values(nodes)) {
      if (node.name.toLowerCase().includes(lower)) ids.add(node.skill);
    }
    return ids;
  }, [nodes]);

  const searchHighlightIds = useMemo((): Set<number> => {
    // While the search modal is open, show only the live-query preview
    if (liveSearchQuery.trim()) return matchNodes(liveSearchQuery);

    // No persistent filters → nothing to highlight
    if (searchFilters.length === 0) return new Set();

    // Compute per-filter match sets
    const matchSets = searchFilters.map((f) => matchNodes(f.query));

    // Combine left-to-right with connectives
    let result = matchSets[0];
    for (let i = 0; i < searchConnectives.length; i++) {
      const right = matchSets[i + 1];
      if (searchConnectives[i] === 'AND') {
        const intersection = new Set<number>();
        for (const id of result) { if (right.has(id)) intersection.add(id); }
        result = intersection;
      } else {
        result = new Set([...result, ...right]);
      }
    }
    return result;
  }, [liveSearchQuery, searchFilters, searchConnectives, matchNodes]);

  // Pulsing gold glow — bloom fill (soft corona) + sharp ring stroke
  const searchGlowPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const id of searchHighlightIds) {
      const node = nodes[id];
      if (!node || isAnchorNode(node)) continue;
      const pos = displayPositions[id];
      if (!pos) continue;
      // Large bloom — 3.5× outerR radiates well beyond the node frame
      path.addCircle(pos.x, pos.y, CATEGORY_STYLE[getCategory(node)].outerR * 3.5);
    }
    return path;
  }, [searchHighlightIds, displayPositions, nodes]);

  const searchRingPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const id of searchHighlightIds) {
      const node = nodes[id];
      if (!node || isAnchorNode(node)) continue;
      const pos = displayPositions[id];
      if (!pos) continue;
      const cat = getCategory(node);
      const outerR = CATEGORY_STYLE[cat].outerR;
      if (cat === 'keystone') {
        addHexagon(path, pos.x, pos.y, outerR * 1.6);
      } else if (cat === 'jewel') {
        addDiamond(path, pos.x, pos.y, outerR * 1.6);
      } else {
        path.addCircle(pos.x, pos.y, outerR * 1.6);
      }
    }
    return path;
  }, [searchHighlightIds, displayPositions, nodes]);

  // Pulse animation: 0 → 1 → 0, looping at ~700 ms per half-cycle
  const pulseAnim = useSharedValue(0);
  const hasHighlights = searchHighlightIds.size > 0;
  useEffect(() => {
    if (hasHighlights) {
      pulseAnim.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseAnim);
      pulseAnim.value = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHighlights]);

  // Opacity derived values for the two glow layers
  const searchBloomOpacity  = useDerivedValue(() => 0.08 + pulseAnim.value * 0.22);
  const searchRingOpacity   = useDerivedValue(() => 0.5  + pulseAnim.value * 0.5);
  // Non-scaling ring stroke so it stays ~5 screen px regardless of zoom
  const searchRingStroke    = useDerivedValue(() => 5.0  / scale.value);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — minimap (once after tree loads)
  // -------------------------------------------------------------------------
  const minimapPaths = useMemo(() => {
    const paths = makeCategoryPaths();
    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node)) continue;
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
            {/* Layer 0: Dark base — shows while background tile loads */}
            <Rect x={0} y={0} width={screenWidth} height={screenHeight} color={COLORS.bgDeep} />

            <Group transform={transform as any}>
              {/* Layer 0.5: World-space tiling background texture */}
              {bgTileImg && treeBounds.width > 0 && (
                <Rect x={-2000} y={-2000} width={treeBounds.width + 4000} height={treeBounds.height + 4000}>
                  <ImageShader image={bgTileImg} tx="repeat" ty="repeat" fit="none" />
                </Rect>
              )}

              {/* Layer 1: Group decorative backgrounds */}
              {visibleGroups.map(g => {
                if (g.isAscendancy) return null;
                const maxOrbit = g.orbits.length > 0 ? Math.max(...g.orbits) : 0;
                const bgImg = groupBgByOrbit[Math.min(maxOrbit, 9)];
                if (!bgImg) return null;
                const bgR = Math.max(g.maxOrbitRadius, 50) * 1.15;
                return (
                  <SkiaImage
                    key={`gbg-${g.id}`}
                    image={bgImg}
                    x={g.x - bgR}
                    y={g.y - bgR}
                    width={bgR * 2}
                    height={bgR * 2}
                    opacity={0.35}
                  />
                );
              })}

              {/* Layer 2: Orbit ring textures — one image per orbit per group */}
              {visibleGroups.map(g => {
                if (g.isAscendancy) return null;
                return (
                  <Group key={`orbits-${g.id}`}>
                    {g.orbits.filter(o => o > 0).map(orbit => {
                      const radius = treeConstants.orbitRadii[orbit] ?? 0;
                      if (radius <= 0) return null;
                      const img = orbitNImgs[orbit];
                      if (!img) return null;
                      return (
                        <SkiaImage
                          key={orbit}
                          image={img}
                          x={g.x - radius}
                          y={g.y - radius}
                          width={radius * 2}
                          height={radius * 2}
                          opacity={0.55}
                        />
                      );
                    })}
                  </Group>
                );
              })}

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

              {/* Layer 6.5: Keystone aura — soft glow behind allocated keystones */}
              <SkiaPath
                path={keystoneGlowPath}
                color={COLORS.nodeKeystone}
                style="fill"
                opacity={0.07}
              />

              {/* Layer 6.7: Search highlight — bloom fill (soft pulsing corona) */}
              <SkiaPath
                path={searchGlowPath}
                color={COLORS.gold}
                style="fill"
                opacity={searchBloomOpacity as any}
              />
              {/* Layer 6.8: Search highlight — ring stroke (sharp pulsing ring) */}
              <SkiaPath
                path={searchRingPath}
                color={COLORS.gold}
                style="stroke"
                strokeWidth={searchRingStroke as any}
                opacity={searchRingOpacity as any}
              />

              {/* Layer 7: Unallocated node outer rings */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`ur-${cat}`}
                  path={nodeRingPaths.unalloc[cat]}
                  color={COLORS.border}
                  style="stroke"
                  strokeWidth={(
                    cat === 'keystone' ? keystoneRingStroke :
                    cat === 'notable'  ? notableRingStroke  :
                    cat === 'jewel'    ? jewelRingStroke    :
                    nodeRingStroke
                  ) as any}
                  opacity={0.55}
                />
              ))}
              {/* Layer 8: Unallocated node fill */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`u-${cat}`}
                  path={nodePaths.unalloc[cat]}
                  color={CATEGORY_STYLE[cat].color}
                  style="fill"
                  opacity={0.35}
                />
              ))}

              {/* Layer 9: Allocated node outer rings — category colour, heavier stroke */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`ar-${cat}`}
                  path={nodeRingPaths.alloc[cat]}
                  color={CATEGORY_STYLE[cat].color}
                  style="stroke"
                  strokeWidth={(
                    cat === 'keystone' ? keystoneRingStroke :
                    cat === 'notable'  ? notableRingStroke  :
                    cat === 'jewel'    ? jewelRingStroke    :
                    nodeRingStroke
                  ) as any}
                  opacity={0.95}
                />
              ))}
              {/* Layer 10: Allocated node fill */}
              {CATEGORY_KEYS.map(cat => (
                <SkiaPath
                  key={`a-${cat}`}
                  path={nodePaths.alloc[cat]}
                  color={CATEGORY_STYLE[cat].color}
                  style="fill"
                />
              ))}

              {/* Layer 10.5: Node frame textures — PoE2 metallic ring art over fills */}
              {nodeFrameData.map(({ nodeId, x, y, size, img }) => (
                <SkiaImage key={nodeId} image={img} x={x} y={y} width={size} height={size} />
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
