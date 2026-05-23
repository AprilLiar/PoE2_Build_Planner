import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { useTreeStore, TreeNode, nodeTypeLabel, nodeTypeBadgeColor } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const MAX_RESULTS = 30;

// Module-level: persists across open/close cycles without remounting
let lastQuery = '';

export default function NodeSearchModal({ visible, onClose }: Props) {
  const { nodes, setFlyToNodeId } = useTreeStore();
  const [query, setQuery] = useState(lastQuery);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    lastQuery = text;
  }, []);

  // Filter and sort results whenever query changes.
  // Order: Keystone → Notable → Normal → Mastery, then alphabetical within each type.
  const results = useMemo<TreeNode[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(nodes)
      .filter((n) => n.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = a.isKeystone ? 0 : a.isNotable ? 1 : a.isMastery ? 3 : 2;
        const pb = b.isKeystone ? 0 : b.isNotable ? 1 : b.isMastery ? 3 : 2;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_RESULTS);
  }, [query, nodes]);

  const handleSelect = useCallback(
    (node: TreeNode) => {
      setFlyToNodeId(node.skill); // GraphicalSkillTree reacts to this
      onClose();
      // Keep query for next open — lastQuery already up-to-date
    },
    [setFlyToNodeId, onClose]
  );

  const handleClose = useCallback(() => {
    onClose();
    // Keep query for next open
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: TreeNode }) => {
      const badgeColor = nodeTypeBadgeColor(item);
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.nodeName} numberOfLines={1}>
            {item.name}
          </Text>
          {/* Type badge: small pill with the node type colour */}
          <View style={[styles.badge, { borderColor: badgeColor }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>
              {nodeTypeLabel(item)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelect]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      {/* Tap the backdrop to dismiss */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          {/* Inner TWF absorbs taps on the card so they don't close the modal */}
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>Search Nodes</Text>

              <TextInput
                style={styles.input}
                value={query}
                onChangeText={handleQueryChange}
                placeholder="Node name…"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />

              {/* Hint / empty states */}
              {query.trim().length === 0 ? (
                <Text style={styles.hint}>Type a node name to search</Text>
              ) : results.length === 0 ? (
                <Text style={styles.hint}>No nodes found</Text>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(n) => String(n.skill)}
                  renderItem={renderItem}
                  style={styles.list}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    paddingTop: 80, // sit below the header area
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    maxHeight: '75%',
  },
  title: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  nodeName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    marginRight: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
