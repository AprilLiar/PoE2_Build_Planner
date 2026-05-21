import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { TreeClass } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  classes: TreeClass[];
  selectedClass: string | null;
  selectedAscendancy: string | null;
  onSelectClass: (name: string | null) => void;
  onSelectAscendancy: (name: string | null) => void;
}

export default function ClassPickerModal({
  visible,
  onClose,
  classes,
  selectedClass,
  selectedAscendancy,
  onSelectClass,
  onSelectAscendancy,
}: Props) {
  const currentClass = classes.find((c) => c.name === selectedClass) ?? null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>Character Setup</Text>
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionLabel}>CLASS</Text>
                <OptionRow
                  label="None"
                  selected={!selectedClass}
                  onPress={() => {
                    onSelectClass(null);
                    onSelectAscendancy(null);
                  }}
                />
                {classes.map((cls) => (
                  <OptionRow
                    key={cls.name}
                    label={cls.name}
                    selected={selectedClass === cls.name}
                    onPress={() => {
                      if (selectedClass !== cls.name) {
                        onSelectClass(cls.name);
                        onSelectAscendancy(null);
                      }
                    }}
                  />
                ))}

                {currentClass && (
                  <>
                    <View style={styles.sectionDivider} />
                    <Text style={styles.sectionLabel}>ASCENDANCY</Text>
                    <OptionRow
                      label="None"
                      selected={!selectedAscendancy}
                      onPress={() => onSelectAscendancy(null)}
                    />
                    {currentClass.ascendancies.map((asc) => (
                      <OptionRow
                        key={asc.name}
                        label={asc.displayName || asc.name}
                        selected={selectedAscendancy === asc.name}
                        onPress={() => onSelectAscendancy(asc.name)}
                      />
                    ))}
                  </>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxHeight: '78%',
    backgroundColor: COLORS.bgPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeText: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.gold,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.gold,
  },
  optionLabel: {
    color: COLORS.textMuted,
    fontSize: 15,
  },
  optionLabelSelected: {
    color: COLORS.gold,
    fontWeight: '600',
  },
});
