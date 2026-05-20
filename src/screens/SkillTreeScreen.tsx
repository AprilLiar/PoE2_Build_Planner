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

// Shape of a single node from GGG's tree.json (actual field names from the export file)
// Note: GGG uses camelCase boolean flags like isKeystone, isNotable, isMastery
interface TreeNode {
  skill: number;       // unique node ID
  name: string;        // display name
  isKeystone?: boolean;
  isNotable?: boolean;
  isMastery?: boolean;
  stats?: string[];    // list of stat description lines
  icon?: string;       // asset path (used in future graphical tree sprint)
}

// Sort order: Keystone first (most powerful), then Notable, Normal, Mastery last
function nodeTypePriority(node: TreeNode): number {
  if (node.isKeystone) return 0;
  if (node.isNotable) return 1;
  if (node.isMastery) return 3;
  return 2; // normal node
}

function nodeTypeLabel(node: TreeNode): string {
  if (node.isKeystone) return 'Keystone';
  if (node.isNotable) return 'Notable';
  if (node.isMastery) return 'Mastery';
  return 'Normal';
}

// Each node type gets a distinct colour in the type badge
function nodeTypeBadgeColor(node: TreeNode): string {
  if (node.isKeystone) return '#C9A84C'; // gold
  if (node.isNotable) return '#3B82F6';  // blue
  if (node.isMastery) return '#8888FF';  // purple
  return '#94A3B8';                      // muted grey
}

// Reads assets/data/tree.json asynchronously via expo-asset + expo-file-system.
// We avoid a top-level require() because tree.json is ~6 MB — bundling it
// synchronously would freeze the JS thread on startup.
async function loadTree(): Promise<TreeNode[]> {
  const [asset] = await Asset.loadAsync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../assets/data/tree.json')
  );

  if (!asset.localUri) {
    throw new Error('tree.json asset could not be resolved to a local URI');
  }

  const jsonString = await FileSystem.readAsStringAsync(asset.localUri);
  const data = JSON.parse(jsonString) as { nodes?: Record<string, TreeNode> };

  // GGG stores nodes as a Record<stringId, node> under the "nodes" key
  const nodesRecord = data.nodes ?? {};
  const nodes = Object.values(nodesRecord);

  // Filter out special internal nodes that have no display name
  const namedNodes = nodes.filter((n) => n.name && n.name.trim().length > 0);

  // Sort: Keystone → Notable → Normal → Mastery
  namedNodes.sort((a, b) => nodeTypePriority(a) - nodeTypePriority(b));

  return namedNodes;
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
          Download tree.json from github.com/grindinggear/skilltree-export and place it in assets/data/
        </Text>
      </View>
    );
  }

  const renderNode = ({ item }: ListRenderItemInfo<TreeNode>) => (
    <View style={styles.row}>
      <Text style={styles.nodeName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.badge, { color: nodeTypeBadgeColor(item) }]}>
        {nodeTypeLabel(item)}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>{nodes.length} nodes</Text>
      <FlatList
        data={nodes}
        keyExtractor={(item) => String(item.skill)}
        renderItem={renderNode}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    color: '#C9A84C',
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
