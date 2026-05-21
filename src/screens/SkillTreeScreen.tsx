import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  useTreeStore,
  TreeNode,
  nodeTypePriority,
  nodeTypeLabel,
  nodeTypeBadgeColor,
} from '../store/useTreeStore';
import NodeDetailSheet from '../components/NodeDetailSheet';
import ClassPickerModal from '../components/ClassPickerModal';
import { COLORS } from '../constants/colors';

const MAX_POINTS = 123;

const Separator = () => <View style={styles.separator} />;

export default function SkillTreeScreen() {
  const {
    nodes,
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

  const [searchQuery, setSearchQuery] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const openPicker = useCallback(() => setPickerVisible(true), []);

  const classAscendancyNames = useMemo(() => {
    if (!selectedClass) return new Set<string>();
    const cls = classes.find((c) => c.name === selectedClass);
    return new Set(cls?.ascendancies.map((a) => a.name) ?? []);
  }, [classes, selectedClass]);

  const filteredNodes = useMemo(() => {
    let result = Object.values(nodes);

    // When a class is selected, hide ascendancy nodes that don't belong to it.
    // When an ascendancy is selected, further narrow to only that ascendancy's nodes.
    if (selectedAscendancy) {
      result = result.filter((n) => !n.ascendancyName || n.ascendancyName === selectedAscendancy);
    } else if (selectedClass) {
      result = result.filter(
        (n) => !n.ascendancyName || classAscendancyNames.has(n.ascendancyName)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.stats?.some((s) => s.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => nodeTypePriority(a) - nodeTypePriority(b));
    return result;
  }, [nodes, searchQuery, selectedClass, selectedAscendancy, classAscendancyNames]);

  const openSheet = useCallback((node: TreeNode) => {
    setSelectedNode(node);
    sheetRef.current?.present();
  }, []);

  const handleToggleFromSheet = useCallback(() => {
    if (selectedNode) toggleNode(selectedNode.skill);
  }, [selectedNode, toggleNode]);

  const renderNode = useCallback(
    ({ item }: ListRenderItemInfo<TreeNode>) => {
      const allocated = allocatedNodes.has(item.skill);
      const isAscendancyNode = !!item.ascendancyName;
      const isSelectedAscNode =
        selectedAscendancy != null && item.ascendancyName === selectedAscendancy;
      const isClassAscNode =
        selectedClass != null &&
        selectedAscendancy == null &&
        isAscendancyNode &&
        classAscendancyNames.has(item.ascendancyName!);
      const highlighted = !allocated && (isSelectedAscNode || isClassAscNode);

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleNode(item.skill)}
          onLongPress={() => openSheet(item)}
          style={[
            styles.row,
            allocated && styles.rowAllocated,
            highlighted && styles.rowClassHighlight,
          ]}
        >
          <View style={styles.rowContent}>
            <View style={styles.rowTop}>
              <Text
                style={[styles.nodeName, allocated && styles.nodeNameAllocated]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View style={styles.rowRight}>
                {allocated && <Text style={styles.checkmark}>✓</Text>}
                <Text style={[styles.badge, { color: nodeTypeBadgeColor(item) }]}>
                  {nodeTypeLabel(item)}
                </Text>
              </View>
            </View>
            {item.stats && item.stats.length > 0 && (
              <Text style={styles.statPreview} numberOfLines={2}>
                {item.stats.slice(0, 2).join('  ·  ')}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [allocatedNodes, classAscendancyNames, selectedClass, selectedAscendancy, toggleNode, openSheet]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No nodes match "{searchQuery}"</Text>
      </View>
    ),
    [searchQuery]
  );

  const pointsUsed = allocatedNodes.size;
  const pointsColor =
    pointsUsed > MAX_POINTS ? COLORS.danger : pointsUsed >= 100 ? COLORS.gold : COLORS.success;

  const clearSelection = useCallback(() => {
    setSelectedClass(null);
    setSelectedAscendancy(null);
  }, [setSelectedClass, setSelectedAscendancy]);

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

  const selectionLabel = selectedClass
    ? selectedAscendancy
      ? `${selectedClass}  ·  ${selectedAscendancy}`
      : selectedClass
    : null;

  return (
    <View style={styles.container}>
      {/* Search bar — cog on the right opens the class/ascendancy picker */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search nodes…"
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={openPicker} style={styles.cogBtn} hitSlop={8}>
          <Text style={styles.cogText}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Active class/ascendancy indicator */}
      {selectionLabel && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectionLabel}</Text>
          <TouchableOpacity onPress={clearSelection} hitSlop={8} style={styles.selectionClearBtn}>
            <Text style={styles.selectionClearText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Point counter */}
      <View style={styles.counterBar}>
        <Text style={styles.counterLabel}>Passive Points Used</Text>
        <Text style={[styles.counterValue, { color: pointsColor }]}>
          {pointsUsed} / {MAX_POINTS}
        </Text>
      </View>

      {/* Node list */}
      <FlatList
        data={filteredNodes}
        keyExtractor={(item) => String(item.skill)}
        renderItem={renderNode}
        extraData={allocatedNodes}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={renderEmpty}
        removeClippedSubviews
        initialNumToRender={25}
        maxToRenderPerBatch={20}
        windowSize={10}
        keyboardShouldPersistTaps="handled"
      />

      {/* Node detail bottom sheet */}
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

  // Cog button in header
  cogBtn: {
    marginRight: 12,
    padding: 4,
  },
  cogText: {
    color: COLORS.textMuted,
    fontSize: 22,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingLeft: 70,
    paddingRight: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 15,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 6,
  },
  clearBtnText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Active selection indicator
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: COLORS.bgInput,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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

  // Counter
  counterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.bgCounter,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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

  // Node rows
  row: {
    backgroundColor: COLORS.bgDeep,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowAllocated: {
    borderLeftColor: COLORS.gold,
    backgroundColor: COLORS.bgAllocated,
  },
  rowClassHighlight: {
    borderLeftColor: COLORS.teal,
  },
  rowContent: {
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nodeName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
  },
  nodeNameAllocated: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
  },
  checkmark: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
  },
  statPreview: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },

  separator: {
    height: 1,
    backgroundColor: COLORS.bgPanel,
    marginLeft: 16,
  },

  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
