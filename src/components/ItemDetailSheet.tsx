import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { Item } from '../types/build';
import { COLORS } from '../constants/colors';

const RARITY_COLOR: Record<string, string> = {
  Normal: '#C8C8C8',
  Magic: '#8888FF',
  Rare: '#FFFF77',
  Unique: '#AF6025',
};

const SNAP_POINTS = ['60%', '90%'];

const Backdrop = (props: any) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

interface Props {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  item: Item | null;
  onEdit: () => void;
  onClear: () => void;
}

export default function ItemDetailSheet({ sheetRef, item, onEdit, onClear }: Props) {
  if (!item) return null;

  const rarityHex = RARITY_COLOR[item.rarity] ?? COLORS.text;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      backdropComponent={Backdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.colorBar, { backgroundColor: rarityHex }]} />
          {!!item.icon && (
            <Image
              source={{ uri: item.icon }}
              style={styles.icon}
              resizeMode="contain"
            />
          )}
          <View style={styles.headerText}>
            <Text style={[styles.itemName, { color: rarityHex }]} numberOfLines={2}>
              {item.name}
            </Text>
            {item.base_type !== item.name && (
              <Text style={styles.baseType}>{item.base_type}</Text>
            )}
            <View style={[styles.rarityBadge, { borderColor: rarityHex }]}>
              <Text style={[styles.rarityBadgeText, { color: rarityHex }]}>
                {item.rarity}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Modifiers */}
        <Text style={styles.sectionLabel}>Modifiers</Text>
        {item.mods.length > 0 ? (
          item.mods.map((mod, i) => (
            <Text key={i} style={styles.modLine}>{mod}</Text>
          ))
        ) : (
          <Text style={styles.noMods}>No modifiers</Text>
        )}

        <View style={styles.divider} />

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => { sheetRef.current?.dismiss(); onEdit(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { onClear(); sheetRef.current?.dismiss(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.clearBtnText}>Clear Slot</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: COLORS.bgPanel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    backgroundColor: COLORS.border,
    width: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 16,
    marginBottom: 12,
  },
  colorBar: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: 12,
    marginTop: 2,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: COLORS.bgDeep,
  },
  headerText: {
    flex: 1,
  },
  itemName: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  baseType: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 6,
  },
  rarityBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  rarityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modLine: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
  },
  noMods: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editBtn: {
    flex: 1,
    backgroundColor: COLORS.teal,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  clearBtn: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
