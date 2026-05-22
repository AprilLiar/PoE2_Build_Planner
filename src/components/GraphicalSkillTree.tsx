import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { G, Circle, Line, Rect } from 'react-native-svg';
import { useTreeStore, TreeNode, nodeTypeBadgeColor, nodeRadius } from '../store/useTreeStore';
import { queryVisibleNodes } from '../utils/treeLayout';
import { COLORS } from '../constants/colors';

/*
 * AnimatedG: SVG group driven by Reanimated on the UI thread.
 * SVG transform "translate(tx,ty) scale(s)" maps world → screen:
 *   screenX = worldX * scale + panX
 *
 * AnimatedRect: used for the minimap viewport indicator, also UI-thread driven.
 */
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Minimap sits in the bottom-right corner above the counter bar
const MINIMAP_SIZE = 130;
const MINIMAP_INNER = MINIMAP_SIZE - 20; // SVG drawing area within the panel

// 25% padding beyond visible bounds: reduces node pop-in while panning
const VIEWPORT_PADDING = 0.25;

interface Props {
  onNodeLongPress: (node: TreeNode) => void;
}

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };

function clamp(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, value));
}

export default function GraphicalSkillTree({ onNodeLongPress }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

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
    flyToNodeId,
    setFlyToNodeId,
  } = useTreeStore();

  // -----------------------------------------------------------------------
  // Fit scale: maps world coords to screen at "view whole tree" zoom
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Camera: shared values (live on UI thread; read from JS via .value)
  // -----------------------------------------------------------------------
  const scale = useSharedValue(fitScale);
  const panX = useSharedValue(fitTX);
  const panY = useSharedValue(fitTY);
  const savedScale = useSharedValue(fitScale);
  const savedPanX = useSharedValue(fitTX);
  const savedPanY = useSharedValue(fitTY);

  // Expose screen dimensions to AnimatedProps worklets (must be shared values)
  const screenWidthSV = useSharedValue(screenWidth);
  const screenHeightSV = useSharedValue(screenHeight);
  useEffect(() => {
    screenWidthSV.value = screenWidth;
    screenHeightSV.value = screenHeight;
  }, [screenWidth, screenHeight, screenWidthSV, screenHeightSV]);

  // Re-centre when tree finishes loading (fitScale/fitTX/fitTY become real values)
  useEffect(() => {
    scale.value = fitScale;
    panX.value = fitTX;
    panY.value = fitTY;
    savedScale.value = fitScale;
    savedPanX.value = fitTX;
    savedPanY.value = fitTY;
  }, [fitScale, fitTX, fitTY, scale, panX, panY, savedScale, savedPanX, savedPanY]);

  // -----------------------------------------------------------------------
  // Viewport tracking for spatial culling
  // Viewport is in world coordinates; updated on gesture end and tree load.
  // 25% padding pre-renders nodes just outside the visible area to hide
  // the brief pop-in that would happen as the camera moves.
  // -----------------------------------------------------------------------
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const computeViewport = useCallback(
    (sc: number, tx: number, ty: number): Viewport => {
      const worldMinX = (0 - tx) / sc;
      const worldMinY = (0 - ty) / sc;
      const worldMaxX = (screenWidth - tx) / sc;
      const worldMaxY = (screenHeight - ty) / sc;
      const padW = (worldMaxX - worldMinX) * VIEWPORT_PADDING;
      const padH = (worldMaxY - worldMinY) * VIEWPORT_PADDING;
      return {
        minX: worldMinX - padW,
        minY: worldMinY - padH,
        maxX: worldMaxX + padW,
        maxY: worldMaxY + padH,
      };
    },
    [screenWidth, screenHeight]
  );

  // Set initial viewport once the tree is loaded and fitScale is known
  useEffect(() => {
    if (!fitScale) return;
    setViewport(computeViewport(fitScale, fitTX, fitTY));
  }, [fitScale, fitTX, fitTY, computeViewport]);

  // Called via runOnJS from gesture onEnd handlers (runs on JS thread)
  const updateViewportJS = useCallback(() => {
    setViewport(computeViewport(scale.value, panX.value, panY.value));
  }, [computeViewport, scale, panX, panY]);

  // -----------------------------------------------------------------------
  // Fly-to: animate camera to a specific node (triggered by search results)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (flyToNodeId == null) return;
    const pos = nodePositions[flyToNodeId];
    if (!pos) { setFlyToNodeId(null); return; }

    // Zoom to a level where the target node and its neighbours are readable
    const targetScale = fitScale * 20;
    const targetTX = screenWidth / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;

    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value = withSpring(targetTX, { damping: 20, stiffness: 120 });
    panY.value = withSpring(targetTY, { damping: 20, stiffness: 120 });

    // Pre-set the culling viewport to the destination so the target node
    // is in the render set immediately (before the spring settles)
    setViewport(computeViewport(targetScale, targetTX, targetTY));
    setFlyToNodeId(null);
  }, [
    flyToNodeId, setFlyToNodeId, nodePositions, fitScale,
    screenWidth, screenHeight, scale, panX, panY, computeViewport,
  ]);

  // -----------------------------------------------------------------------
  // Camera: fly to class start node when selectedClass changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!selectedClass) return;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return;
    const pos = nodePositions[startId];
    if (!pos) return;

    const targetScale = fitScale * 10;
    const targetTX = screenWidth / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;

    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value = withSpring(targetTX, { damping: 20, stiffness: 120 });
    panY.value = withSpring(targetTY, { damping: 20, stiffness: 120 });
  }, [
    selectedClass, classStartNodes, nodePositions, fitScale,
    screenWidth, screenHeight, scale, panX, panY,
  ]);

  // -----------------------------------------------------------------------
  // AnimatedG props — drives the SVG group transform on the UI thread.
  // screenX = worldX * scale + panX  (scale is around SVG origin 0,0)
  // -----------------------------------------------------------------------
  const animatedGProps = useAnimatedProps(() => ({
    transform: `translate(${panX.value}, ${panY.value}) scale(${scale.value})` as any,
  }));

  // -----------------------------------------------------------------------
  // Minimap viewport rect — animated on the UI thread via AnimatedRect.
  // Uses the same viewBox coordinate space as the tree (world units) so
  // the SVG viewBox scaling handles pixel mapping automatically.
  // strokeWidth 500 world units ≈ 1.5–2 px at minimap scale (110 / 33000).
  // -----------------------------------------------------------------------
  const minimapViewportProps = useAnimatedProps(() => ({
    x: (0 - panX.value) / scale.value,
    y: (0 - panY.value) / scale.value,
    width: screenWidthSV.value / scale.value,
    height: screenHeightSV.value / scale.value,
  } as any));

  // -----------------------------------------------------------------------
  // Gesture handlers
  // -----------------------------------------------------------------------
  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onStart(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      panX.value = savedPanX.value + e.translationX;
      panY.value = savedPanY.value + e.translationY;
    })
    .onEnd(() => {
      // Refresh culling viewport once the finger lifts
      runOnJS(updateViewportJS)();
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      const newScale = clamp(savedScale.value * e.scale, fitScale * 0.5, fitScale * 500);
      const ratio = newScale / savedScale.value;
      // Zoom toward the pinch midpoint (formula works because scale is around SVG origin)
      panX.value = e.focalX - (e.focalX - savedPanX.value) * ratio;
      panY.value = e.focalY - (e.focalY - savedPanY.value) * ratio;
      scale.value = newScale;
    })
    .onEnd(() => {
      runOnJS(updateViewportJS)();
    });

  // -----------------------------------------------------------------------
  // Hit testing — linear scan (fast enough since it's JS-only, not per-frame)
  // Convert screen → world: worldX = (screenX - panX) / scale
  // -----------------------------------------------------------------------
  const hitTest = useCallback(
    (screenX: number, screenY: number, threshPx: number): number | null => {
      const sc = scale.value;
      const tx = panX.value;
      const ty = panY.value;
      const wx = (screenX - tx) / sc;
      const wy = (screenY - ty) / sc;
      const threshWorld = threshPx / sc;
      const threshSq = threshWorld * threshWorld;

      let bestId: number | null = null;
      let bestDist = threshSq;
      for (const [idStr, pos] of Object.entries(nodePositions)) {
        const dx = pos.x - wx;
        const dy = pos.y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          bestId = Number(idStr);
        }
      }
      return bestId;
    },
    [nodePositions, scale, panX, panY]
  );

  const handleTap = useCallback(
    (screenX: number, screenY: number) => {
      const id = hitTest(screenX, screenY, 30);
      if (id !== null) toggleNode(id);
    },
    [hitTest, toggleNode]
  );

  const handleLongPress = useCallback(
    (screenX: number, screenY: number) => {
      const id = hitTest(screenX, screenY, 40);
      if (id !== null) {
        const node = nodes[id];
        if (node) onNodeLongPress(node);
      }
    },
    [hitTest, nodes, onNodeLongPress]
  );

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(handleTap)(e.x, e.y);
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .onStart((e) => {
      runOnJS(handleLongPress)(e.x, e.y);
    });

  const gesture = Gesture.Simultaneous(
    panGesture,
    pinchGesture,
    Gesture.Exclusive(longPressGesture, tapGesture)
  );

  // -----------------------------------------------------------------------
  // Ascendancy highlight sets (teal ring on nodes of selected class/ascendancy)
  // -----------------------------------------------------------------------
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

  // Class start node shown as visually allocated (but not counted in points)
  const visuallyAllocated = useMemo(() => {
    if (!selectedClass) return allocatedNodes;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return allocatedNodes;
    const expanded = new Set(allocatedNodes);
    expanded.add(startId);
    return expanded;
  }, [allocatedNodes, selectedClass, classStartNodes]);

  // -----------------------------------------------------------------------
  // Spatial culling: derive the visible node set from the spatial grid.
  // null = no grid yet → render everything (safe fallback).
  // -----------------------------------------------------------------------
  const visibleNodeIds = useMemo(() => {
    if (!spatialGrid || !viewport) return null;
    return queryVisibleNodes(
      spatialGrid,
      viewport.minX,
      viewport.minY,
      viewport.maxX,
      viewport.maxY
    );
  }, [spatialGrid, viewport]);

  // -----------------------------------------------------------------------
  // SVG element arrays — memoized; culled to visible viewport
  // -----------------------------------------------------------------------
  const edgeElements = useMemo(() => {
    const entries = Object.entries(nodePositions);
    if (!entries.length) return null;
    const lines: React.ReactElement[] = [];

    for (const [, node] of Object.entries(nodes)) {
      const fromPos = nodePositions[node.skill];
      if (!fromPos) continue;
      for (const conn of node.connections ?? []) {
        if (node.skill >= conn.id) continue; // deduplicate: lower ID → higher ID only
        const toPos = nodePositions[conn.id];
        if (!toPos) continue;
        // Keep edge if at least one endpoint is in the visible area
        if (visibleNodeIds && !visibleNodeIds.has(node.skill) && !visibleNodeIds.has(conn.id)) {
          continue;
        }
        const bothAllocated = visuallyAllocated.has(node.skill) && visuallyAllocated.has(conn.id);
        lines.push(
          <Line
            key={`e-${node.skill}-${conn.id}`}
            x1={fromPos.x}
            y1={fromPos.y}
            x2={toPos.x}
            y2={toPos.y}
            stroke={bothAllocated ? COLORS.gold : COLORS.border}
            strokeWidth={bothAllocated ? 6 : 4}
            strokeOpacity={bothAllocated ? 0.9 : 0.45}
          />
        );
      }
    }
    return lines;
  }, [nodes, nodePositions, visuallyAllocated, visibleNodeIds]);

  const nodeElements = useMemo(() => {
    if (!Object.keys(nodePositions).length) return null;
    const circles: React.ReactElement[] = [];

    for (const [, node] of Object.entries(nodes)) {
      const pos = nodePositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;

      const allocated = visuallyAllocated.has(node.skill);
      const color = nodeTypeBadgeColor(node);
      const r = nodeRadius(node);
      const isHighlighted =
        !!node.ascendancyName && highlightedAscendancies.has(node.ascendancyName);

      if (isHighlighted) {
        circles.push(
          <Circle
            key={`hl-${node.skill}`}
            cx={pos.x}
            cy={pos.y}
            r={r + 10}
            fill="transparent"
            stroke={COLORS.teal}
            strokeWidth={4}
            strokeOpacity={0.8}
          />
        );
      }

      circles.push(
        <Circle
          key={`n-${node.skill}`}
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill={allocated ? color : 'transparent'}
          stroke={color}
          strokeWidth={allocated ? 0 : 3}
          strokeOpacity={allocated ? 1 : 0.55}
        />
      );
    }
    return circles;
  }, [nodes, nodePositions, visuallyAllocated, highlightedAscendancies, visibleNodeIds]);

  // Minimap dots — tiny circles representing every node in world coordinates.
  // No allocation state shown; this is intentionally static (memoized once per load).
  // Radii are in world units; the SVG viewBox scales them to minimap pixels.
  // Keystone 180wu ≈ 0.6px, Notable 120wu ≈ 0.4px, Normal 80wu ≈ 0.3px on minimap.
  const minimapDots = useMemo(() => {
    if (!Object.keys(nodePositions).length) return null;
    return Object.values(nodes).map((node) => {
      const pos = nodePositions[node.skill];
      if (!pos) return null;
      const r = node.isKeystone ? 180 : node.isNotable ? 130 : 80;
      return (
        <Circle
          key={`mm-${node.skill}`}
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill={nodeTypeBadgeColor(node)}
          fillOpacity={0.65}
        />
      );
    });
  }, [nodes, nodePositions]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const showMinimap = treeBounds.width > 0 && treeBounds.height > 0;

  return (
    <View style={styles.container}>
      {/* Main canvas — full-screen gesture-driven SVG */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Svg width={screenWidth} height={screenHeight}>
            <AnimatedG animatedProps={animatedGProps}>
              {edgeElements}
              {nodeElements}
            </AnimatedG>
          </Svg>
        </View>
      </GestureDetector>

      {/* Minimap — bottom-right corner; shows the whole tree with an animated
          viewport indicator rectangle that updates on the UI thread. */}
      {showMinimap && (
        <View style={styles.minimap}>
          <Svg
            width={MINIMAP_INNER}
            height={MINIMAP_INNER}
            viewBox={`0 0 ${treeBounds.width} ${treeBounds.height}`}
          >
            {minimapDots}
            {/* Viewport rect in world coordinates — AnimatedRect drives it on UI thread */}
            <AnimatedRect
              animatedProps={minimapViewportProps}
              fill="rgba(201, 168, 76, 0.06)"
              stroke={COLORS.gold}
              strokeWidth={500}
              strokeOpacity={0.85}
            />
          </Svg>
        </View>
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
    // Sit above the counter bar (which is ~44px) + a small gap
    bottom: 54,
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
