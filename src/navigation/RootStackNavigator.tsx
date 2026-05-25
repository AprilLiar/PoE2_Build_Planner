import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BuildListScreen from '../screens/BuildListScreen';
import DrawerNavigator from './DrawerNavigator';

// Screens at the root level.
// BuildList is always the entry point; BuildDrawer wraps the per-build drawer screens.
export type RootStackParamList = {
  BuildList: undefined;
  BuildDrawer: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="BuildList" component={BuildListScreen} />
      <Stack.Screen name="BuildDrawer" component={DrawerNavigator} />
    </Stack.Navigator>
  );
}
