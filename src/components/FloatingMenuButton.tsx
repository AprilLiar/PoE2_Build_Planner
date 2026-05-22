import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef } from '../navigation/navigationRef';
import { DrawerParamList } from '../navigation/DrawerNavigator';
import { COLORS } from '../constants/colors';

const SCREENS: { name: keyof DrawerParamList; label: string }[] = [
  { name: 'Skill Tree', label: 'Skill Tree' },
  { name: 'Items', label: 'Items' },
  { name: 'Gems', label: 'Gems' },
];

export default function FloatingMenuButton() {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [currentRoute, setCurrentRoute] = useState<string | null>(null);

  useEffect(() => {
    if (navigationRef.isReady()) {
      setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null);
    }
    return navigationRef.addListener('state', () => {
      setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null);
    });
  }, []);

  const navigate = (screen: keyof DrawerParamList) => {
    navigationRef.navigate(screen);
    setOpen(false);
  };

  const btnTop = insets.top + 12;
  const btnLeft = insets.left + 16;

  return (
    <>
      <View style={[styles.shadow, { top: btnTop, left: btnLeft }]}>
        <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} activeOpacity={0.8}>
          <View style={styles.bar} />
          <View style={styles.bar} />
          <View style={styles.bar} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.menu, { top: btnTop + 54, left: btnLeft }]}>
            {SCREENS.map((screen) => {
              const active = currentRoute === screen.name;
              return (
                <TouchableOpacity
                  key={screen.name}
                  style={[styles.menuItem, active && styles.menuItemActive]}
                  onPress={() => navigate(screen.name)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>
                    {screen.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    zIndex: 100,
    borderRadius: 22,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.45)',
    elevation: 10,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bar: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.text,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  menu: {
    position: 'absolute',
    backgroundColor: COLORS.bgPanel,
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 160,
    borderWidth: 1,
    borderColor: COLORS.border,
    boxShadow: '0px 6px 12px rgba(0,0,0,0.4)',
    elevation: 14,
  },
  menuItem: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginHorizontal: 6,
  },
  menuItemActive: {
    backgroundColor: COLORS.bgInput,
  },
  menuLabel: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  menuLabelActive: {
    color: COLORS.gold,
    fontWeight: '700',
  },
});
