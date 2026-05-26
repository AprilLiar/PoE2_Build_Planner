import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBuildStore } from '../store/useBuildStore';
import { Item, ItemSlot } from '../types/build';
import ItemPasteModal from '../components/ItemPasteModal';
import ItemDetailSheet from '../components/ItemDetailSheet';
import { COLORS } from '../constants/colors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_COLOR: Record<string, string> = {
  Normal: '#C8C8C8',
  Magic: '#8888FF',
  Rare: '#FFFF77',
  Unique: '#AF6025',
};

const SLOT_LABELS: Record<ItemSlot, string> = {
  Helm: 'Helm',
  Chest: 'Chest',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Weapon1: 'Weapon',
  Weapon2: 'Weapon 2',
  Offhand1: 'Offhand',
  Offhand2: 'Offhand 2',
  Ring1: 'Ring',
  Ring2: 'Ring',
  Amulet: 'Amulet',
  Belt: 'Belt',
  Flask1: 'Flask 1',
  Flask2: 'Flask 2',
  Flask3: 'Flask 3',
  Flask4: 'Flask 4',
  Flask5: 'Flask 5',
  Charm1: 'Charm 1',
  Charm2: 'Charm 2',
  Charm3: 'Charm 3',
};

interface SlotGroup {
  label: string;
  slots: ItemSlot[];
  columns: number;
}

const SLOT_GROUPS: SlotGroup[] = [
  { label: 'Armour',    slots: ['Helm', 'Chest', 'Gloves', 'Boots'],                           columns: 2 },
  { label: 'Weapons',   slots: ['Weapon1', 'Offhand1', 'Weapon2', 'Offhand2'],                  columns: 2 },
  { label: 'Jewellery', slots: ['Ring1', 'Ring2', 'Amulet', 'Belt'],                            columns: 4 },
  { label: 'Flasks',    slots: ['Flask1', 'Flask2', 'Flask3', 'Flask4', 'Flask5'],              columns: 5 },
  { label: 'Charms',    slots: ['Charm1', 'Charm2', 'Charm3'],                                  columns: 3 },
];

// ---------------------------------------------------------------------------
// SlotCard
// ---------------------------------------------------------------------------

interface SlotCardProps {
  slot: ItemSlot;
  item: Item | undefined;
  cardWidth: number;
  onPress: () => void;
}

function SlotCard({ slot, item, cardWidth, onPress }: SlotCardProps) {
  const filled = !!item;
  const rarityColor = item ? (RARITY_COLOR[item.rarity] ?? COLORS.text) : COLORS.textMuted;

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }, filled && { borderTopColor: rarityColor, borderTopWidth: 2 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {filled ? (
        <View style={styles.cardFilled}>
          <View style={styles.cardFilledText}>
            <Text style={[styles.cardItemName, { color: rarityColor }]} numberOfLines={1}>
              {item!.name}
            </Text>
            {item!.base_type !== item!.name && (
              <Text style={styles.cardBaseType} numberOfLines={1}>{item!.base_type}</Text>
            )}
          </View>
          {!!item!.icon && (
            <Image
              source={{ uri: item!.icon }}
              style={styles.cardIcon}
              resizeMode="contain"
            />
          )}
        </View>
      ) : (
        <View style={styles.cardEmpty}>
          <Text style={styles.cardSlotLabel}>{SLOT_LABELS[slot]}</Text>
          <Text style={styles.cardPlus}>+</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// ItemsScreen
// ---------------------------------------------------------------------------

export default function ItemsScreen() {
  const { currentBuild, updateItems } = useBuildStore();
  const { width: screenWidth } = useWindowDimensions();

  const [items, setItems] = useState<Item[]>([]);
  const [pasteTarget, setPasteTarget] = useState<ItemSlot | null>(null);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const detailSheetRef = useRef<BottomSheetModal>(null);

  // Sync from store on mount / build change
  useEffect(() => {
    if (currentBuild) setItems(currentBuild.items);
  }, [currentBuild]);

  const itemBySlot = useCallback(
    (slot: ItemSlot) => items.find((i) => i.slot === slot),
    [items]
  );

  const handleSlotPress = useCallback(
    (slot: ItemSlot) => {
      const existing = items.find((i) => i.slot === slot);
      if (existing) {
        setDetailItem(existing);
        detailSheetRef.current?.present();
      } else {
        setPasteTarget(slot);
      }
    },
    [items]
  );

  const handleConfirm = useCallback(
    (item: Item) => {
      const newItems = [...items.filter((i) => i.slot !== item.slot), item];
      setItems(newItems);
      updateItems(newItems);
      setPasteTarget(null);
    },
    [items, updateItems]
  );

  const handleEdit = useCallback(() => {
    if (detailItem) setPasteTarget(detailItem.slot);
    setDetailItem(null);
  }, [detailItem]);

  const handleClear = useCallback(() => {
    if (!detailItem) return;
    const newItems = items.filter((i) => i.slot !== detailItem.slot);
    setItems(newItems);
    updateItems(newItems);
    setDetailItem(null);
  }, [detailItem, items, updateItems]);

  const GUTTER = 8;
  const H_PAD = 16;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {currentBuild ? (
          SLOT_GROUPS.map((group) => {
            const availableWidth = screenWidth - H_PAD * 2;
            const cardWidth =
              (availableWidth - GUTTER * (group.columns - 1)) / group.columns;

            return (
              <View key={group.label} style={styles.group}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <View style={[styles.grid, { gap: GUTTER }]}>
                  {group.slots.map((slot) => (
                    <SlotCard
                      key={slot}
                      slot={slot}
                      item={itemBySlot(slot)}
                      cardWidth={cardWidth}
                      onPress={() => handleSlotPress(slot)}
                    />
                  ))}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No build loaded.</Text>
            <Text style={styles.emptySubtext}>Open a build from the Build List to manage items.</Text>
          </View>
        )}
      </ScrollView>

      {pasteTarget && (
        <ItemPasteModal
          visible
          slot={pasteTarget}
          initialRawText={items.find((i) => i.slot === pasteTarget)?.raw_text}
          onClose={() => setPasteTarget(null)}
          onConfirm={handleConfirm}
        />
      )}

      <ItemDetailSheet
        sheetRef={detailSheetRef}
        item={detailItem}
        onEdit={handleEdit}
        onClear={handleClear}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 20,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 56,
    overflow: 'hidden',
  },
  cardEmpty: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardSlotLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  cardPlus: {
    color: COLORS.textMuted,
    fontSize: 18,
    lineHeight: 22,
  },
  cardFilled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  cardFilledText: {
    flex: 1,
  },
  cardItemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardBaseType: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: COLORS.bgDeep,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
