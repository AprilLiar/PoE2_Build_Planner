import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTreeStore, TreeNode } from '../store/useTreeStore';
import NodeDetailSheet from '../components/NodeDetailSheet';
import ClassPickerModal from '../components/ClassPickerModal';
import GraphicalSkillTree from '../components/GraphicalSkillTree';
import NodeSearchModal from '../components/NodeSearchModal';
import { COLORS } from '../constants/colors';

const MAX_POINTS = 123;

export default function SkillTreeScreen() {
  const {
    classes,
    allocatedNodes,
    isLoaded,
    error,
    loadTree,
    toggleNode,
    selectedClass,
    selectedAscendancy,
    setSelectedClass,
    setSelectedAscendancy,
  } = useTreeStore();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  // loadTree is idempotent — safe to call on every mount
  React.useEffect(() => {
    loadTree();
  }, [loadTree]);

  const openSheet = useCallback((node: TreeNode) => {
    setSelectedNode(node);
    sheetRef.current?.present();
  }, []);

  const handleToggleFromSheet = useCallback(() => {
    if (selectedNode) toggleNode(selectedNode.skill);
  }, [selectedNode, toggleNode]);

  const clearSelection = useCallback(() => {
    setSelectedClass(null);
    setSelectedAscendancy(null);
  }, [setSelectedClass, setSelectedAscendancy]);

  const pointsUsed = allocatedNodes.size;
  const pointsColor =
    pointsUsed > MAX_POINTS ? COLORS.danger : pointsUsed >= 100 ? COLORS.gold : COLORS.success;

  const selectionLabel = selectedClass
    ? selectedAscendancy
      ? `${selectedClass}  ·  ${selectedAscendancy}`
      : selectedClass
    : null;

  // While tree is loading show a spinner over the dark background
  if (!isLoaded && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading passive tree…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load tree.json</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Full-screen graphical skill tree canvas */}
      <GraphicalSkillTree onNodeLongPress={openSheet} />

      {/* Top overlay: cog (left) + optional class chip (centre) + search icon (right) */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          style={styles.cogBtn}
          hitSlop={8}
        >
          <Text style={styles.cogText}>⚙</Text>
        </TouchableOpacity>

        {/* Flexible middle: holds the class/ascendancy selection chip if active */}
        <View style={styles.topMiddle} pointerEvents="box-none">
          {selectionLabel && (
            <View style={styles.selectionChip}>
              <Text style={styles.selectionText}>{selectionLabel}</Text>
              <TouchableOpacity onPress={clearSelection} hitSlop={8} style={styles.selectionClearBtn}>
                <Text style={styles.selectionClearText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Search button — always right-aligned */}
        <TouchableOpacity
          onPress={() => setSearchVisible(true)}
          style={styles.searchBtn}
          hitSlop={8}
        >
          <Text style={styles.searchIcon}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom overlay: passive point counter */}
      <View style={styles.counterOverlay} pointerEvents="none">
        <Text style={styles.counterLabel}>Passive Points</Text>
        <Text style={[styles.counterValue, { color: pointsColor }]}>
          {pointsUsed} / {MAX_POINTS}
        </Text>
      </View>

      {/* Node detail bottom sheet (long-press) */}
      <NodeDetailSheet
        sheetRef={sheetRef}
        node={selectedNode}
        isAllocated={selectedNode ? allocatedNodes.has(selectedNode.skill) : false}
        onToggle={handleToggleFromSheet}
      />

      {/* Class / ascendancy picker modal */}
      <ClassPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        classes={classes}
        selectedClass={selectedClass}
        selectedAscendancy={selectedAscendancy}
        onSelectClass={setSelectedClass}
        onSelectAscendancy={setSelectedAscendancy}
      />

      {/* Node search modal — tap a result to fly the camera to that node */}
      <NodeSearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 15,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDetail: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },

  // --- Top overlay ---
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cogBtn: {
    padding: 4,
    marginRight: 10,
  },
  cogText: {
    color: COLORS.textMuted,
    fontSize: 22,
  },
  topMiddle: {
    flex: 1,
    marginRight: 8,
  },
  searchBtn: {
    padding: 4,
  },
  searchIcon: {
    fontSize: 20,
  },
  selectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectionText: {
    color: COLORS.teal,
    fontSize: 13,
    fontWeight: '600',
  },
  selectionClearBtn: {
    padding: 4,
  },
  selectionClearText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },

  // --- Bottom counter overlay ---
  counterOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  counterLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  counterValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});
