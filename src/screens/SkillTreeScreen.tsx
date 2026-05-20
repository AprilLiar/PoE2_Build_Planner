import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

// The shape of a single node from GGG's tree.json
// Only the fields we need for this screen are typed here
interface TreeNode {
  id: number;
  dn: string;          // display name
  ks?: boolean;        // keystone
  not?: boolean;       // notable
  m?: boolean;         // mastery
  sd?: string[];       // stat descriptions
}

// Maps each node type to a sort priority (lower = shown first)
function nodeTypePriority(node: TreeNode): number {
  if (node.ks) return 0;   // Keystone
  if (node.not) return 1;  // Notable
  if (node.m) return 3;    // Mastery
  return 2;                // Normal
}

// Returns a human-readable label for the node type badge
function nodeTypeLabel(node: TreeNode): string {
  if (node.ks) return 'Keystone';
  if (node.not) return 'Notable';
  if (node.m) return 'Mastery';
  return 'Normal';
}

// Returns the colour used for the type badge text
function nodeTypeBadgeColor(node: TreeNode): string {
  if (node.ks) return '#C9A84C';   // gold — keystones are the most powerful nodes
  if (node.not) return '#3B82F6';  // blue — notables are mid-tier
  if (node.m) return '#8888FF';    // purple — masteries
  return '#94A3B8';                // muted grey — normal nodes
}

// Reads assets/data/tree.json via expo-asset + expo-file-system.
// We avoid a top-level require() because tree.json is ~10 MB — bundling it
// synchronously would freeze the JS thread on startup.
async function loadTree(): Promise<TreeNode[]> {
  // expo-asset resolves the local file URI of a bundled asset
  const [asset] = await Asset.loadAsync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../assets/data/tree.json')
  );

  if (!asset.localUri) {
    throw new Error('tree.json asset could not be resolved to a local URI');
  }

  // Read the file as a string, then parse — keeps the main thread free until here
  const jsonString = await FileSystem.readAsStringAsync(asset.localUri);
  const data = JSON.parse(jsonString);

  // GGG's tree JSON stores nodes as a Record<string, node> under the "nodes" key
  const nodesRecord: Record<string, TreeNode> = data.nodes ?? {};
  const nodes = Object.values(nodesRecord);

  // Sort: Keystone (0) → Notable (1) → Normal (2) → Mastery (3)
  nodes.sort((a, b) => nodeTypePriority(a) - nodeTypePriority(b));

  return nodes;
}

export default function SkillTreeScreen() {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTree()
      .then(setNodes)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
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
        <Text style={styles.errorHint}>
          Make sure assets/data/tree.json exists (download from github.com/grindinggear/skilltree-export)
        </Text>
      </View>
    );
  }

  const renderNode = ({ item }: ListRenderItemInfo<TreeNode>) => (
    <View style={styles.row}>
      <Text style={styles.nodeName} numberOfLines={1}>
        {item.dn || '(unnamed node)'}
      </Text>
      <Text style={[styles.badge, { color: nodeTypeBadgeColor(item) }]}>
        {nodeTypeLabel(item)}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>{nodes.length} nodes loaded</Text>
      <FlatList
        data={nodes}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderNode}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        // Boost performance on large lists by letting React Native skip
        // offscreen items when the list is scrolled quickly
        removeClippedSubviews
        initialNumToRender={30}
        maxToRenderPerBatch={20}
        windowSize={10}
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
    marginBottom: 12,
  },
  errorHint: {
    color: '#3B82F6',
    fontSize: 12,
    textAlign: 'center',
  },
  counter: {
    color: '#94A3B8',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A5F',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  nodeName: {
    flex: 1,
    color: '#C9A84C',   // gold — matches PoE2 aesthetic
    fontSize: 15,
    marginRight: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#1E3A5F',
    marginHorizontal: 16,
  },
});
