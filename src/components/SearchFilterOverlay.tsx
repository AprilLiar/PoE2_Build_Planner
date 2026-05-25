import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTreeStore } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

// Sits in the top-right corner, below the header, on top of the tree canvas.
// Each filter is a chip; between chips is an AND/OR toggle button.
export default function SearchFilterOverlay() {
  const insets = useSafeAreaInsets();
  const searchFilters     = useTreeStore((s) => s.searchFilters);
  const searchConnectives = useTreeStore((s) => s.searchConnectives);
  const removeSearchFilter    = useTreeStore((s) => s.removeSearchFilter);
  const toggleSearchConnective = useTreeStore((s) => s.toggleSearchConnective);

  const handleRemove = useCallback(
    (id: string) => removeSearchFilter(id),
    [removeSearchFilter]
  );
  const handleToggle = useCallback(
    (i: number) => toggleSearchConnective(i),
    [toggleSearchConnective]
  );

  if (searchFilters.length === 0) return null;

  // Position below the header: insets.top + header padding (~8) + button row (~34) + bottom padding (~8) + gap
  const topOffset = insets.top + 58;

  return (
    <View style={[styles.container, { top: topOffset }]} pointerEvents="box-none">
      {searchFilters.map((filter, i) => (
        <React.Fragment key={filter.id}>
          <View style={styles.chip} pointerEvents="auto">
            <Text style={styles.chipText} numberOfLines={1}>{filter.query}</Text>
            <TouchableOpacity
              onPress={() => handleRemove(filter.id)}
              hitSlop={8}
              style={styles.removeBtn}
            >
              <Text style={styles.removeText}>×</Text>
            </TouchableOpacity>
          </View>

          {i < searchFilters.length - 1 && (
            <TouchableOpacity
              style={styles.connective}
              onPress={() => handleToggle(i)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.connectiveText,
                searchConnectives[i] === 'OR' && styles.connectiveTextOr,
              ]}>
                {searchConnectives[i] ?? 'AND'}
              </Text>
            </TouchableOpacity>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    alignItems: 'flex-end',
    zIndex: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 14, 26, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 160,
  },
  chipText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 6,
  },
  removeBtn: {
    paddingHorizontal: 2,
  },
  removeText: {
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '400',
  },
  connective: {
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginVertical: 3,
  },
  connectiveText: {
    color: COLORS.teal,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  connectiveTextOr: {
    color: COLORS.gold,
  },
});
