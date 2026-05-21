import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
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

const MAX_POINTS = 123;

export default function SkillTreeScreen() {
  const { nodes, classes, allocatedNodes, isLoaded, error, loadTree, toggleNode } =
    useTreeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const classAscendancyNames = useMemo(() => {
    if (!selectedClass) return new Set<string>();
    const cls = classes.find((c) => c.name === selectedClass);
    return new Set(cls?.ascendancies.map((a) => a.name) ?? []);
  }, [classes, selectedClass]);

  const filteredNodes = useMemo(() => {
    let result = Object.values(nodes);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => nodeTypePriority(a) - nodeTypePriority(b));
    return result;
  }, [nodes, searchQuery]);

  const openSheet = useCallback((node: TreeNode) => {
    setSelectedNode(node);
    sheetRef.current?.present();
  }, []);

  const handleToggleFromSheet = useCallback(() => {
    if (selectedNode) toggleNode(selectedNode.skill);
  }, [selectedNode, toggleNode]);

  const pointsUsed = allocatedNodes.size;
  const pointsColor =
    pointsUsed > MAX_POINTS ? '#DC2626' : pointsUsed >= 100 ? '#C9A84C' : '#16A34A';

  if (!isLoaded && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#C9A84C" />
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

  const renderNode = ({ item }: ListRenderItemInfo<TreeNode>) => {
    const allocated = allocatedNodes.has(item.skill);
    const classHighlight =
      !allocated && !!item.ascendancyName && classAscendancyNames.has(item.ascendancyName);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => toggleNode(item.skill)}
        onLongPress={() => openSheet(item)}
        style={[
          styles.row,
          allocated && styles.rowAllocated,
          classHighlight && styles.rowClassHighlight,
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
  };

  return (
    <View style={styles.container}>
      {/* Class selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.classScroll}
        contentContainerStyle={styles.classScrollContent}
      >
        <TouchableOpacity
          style={[styles.classChip, !selectedClass && styles.classChipActive]}
          onPress={() => setSelectedClass(null)}
        >
          <Text style={[styles.classChipText, !selectedClass && styles.classChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {classes.map((cls) => (
          <TouchableOpacity
            key={cls.name}
            style={[styles.classChip, selectedClass === cls.name && styles.classChipActive]}
            onPress={() => setSelectedClass(cls.name)}
          >
            <Text
              style={[
                styles.classChipText,
                selectedClass === cls.name && styles.classChipTextActive,
              ]}
            >
              {cls.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search nodes…"
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

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
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        removeClippedSubviews
        initialNumToRender={25}
        maxToRenderPerBatch={20}
        windowSize={10}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No nodes match "{searchQuery}"</Text>
          </View>
        }
      />

      {/* Node detail bottom sheet */}
      <NodeDetailSheet
        sheetRef={sheetRef}
        node={selectedNode}
        isAllocated={selectedNode ? allocatedNodes.has(selectedNode.skill) : false}
        onToggle={handleToggleFromSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0A0E1A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 15,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDetail: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },

  // Class selector
  classScroll: {
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A5F',
    flexGrow: 0,
  },
  classScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  classChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#1E3A5F',
  },
  classChipActive: {
    backgroundColor: '#C9A84C',
    borderColor: '#C9A84C',
  },
  classChipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  classChipTextActive: {
    color: '#0A0E1A',
    fontWeight: '700',
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A5F',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#E2E8F0',
    fontSize: 15,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 6,
  },
  clearBtnText: {
    color: '#94A3B8',
    fontSize: 14,
  },

  // Counter
  counterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0D1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A5F',
  },
  counterLabel: {
    color: '#94A3B8',
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
    backgroundColor: '#0A0E1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowAllocated: {
    borderLeftColor: '#C9A84C',
    backgroundColor: '#0D1408',
  },
  rowClassHighlight: {
    borderLeftColor: '#0D9488',
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
    color: '#E2E8F0',
    fontSize: 15,
  },
  nodeNameAllocated: {
    color: '#C9A84C',
    fontWeight: '600',
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
  },
  checkmark: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '700',
  },
  statPreview: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },

  separator: {
    height: 1,
    backgroundColor: '#111827',
    marginLeft: 16,
  },

  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
