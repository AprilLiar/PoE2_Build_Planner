import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState } from '@react-navigation/native';
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

  // Track the active screen so we can highlight it in the menu.
  const currentRoute = useNavigationState((state) => {
    if (!state) return null;
    return state.routes[state.index]?.name;
  });

  const navigate = (screen: keyof DrawerParamList) => {
    navigationRef.navigate(screen);
    setOpen(false);
  };

  // Position the button just inside the safe area.
  const btnTop = insets.top + 12;
  const btnLeft = insets.left + 16;

  return (
    <>
      {/* Floating round hamburger button */}
      <View style={[styles.shadow, { top: btnTop, left: btnLeft }]}>
        <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} activeOpacity={0.8}>
          <View style={styles.bar} />
          <View style={styles.bar} />
          <View style={styles.bar} />
        </TouchableOpacity>
      </View>

      {/* Overlay menu */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              {/* Menu card appears just below the button */}
              <View style={[styles.menu, { top: btnTop + 54, left: btnLeft }]}>
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Wrapper carries the shadow so the shadow is not clipped by the button's overflow.
  shadow: {
    position: 'absolute',
    zIndex: 100,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
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
