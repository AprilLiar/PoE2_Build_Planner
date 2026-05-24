import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';
import RootStackNavigator from './navigation/RootStackNavigator';
import FloatingMenuButton from './components/FloatingMenuButton';
import { navigationRef } from './navigation/navigationRef';

// AppContent is a separate component so FloatingMenuButton can use
// navigation hooks (useNavigationState) that require being inside NavigationContainer.
function AppContent() {
  return (
    <>
      <RootStackNavigator />
      <FloatingMenuButton />
      {/* Toast must be the last child so it renders above everything else */}
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <BottomSheetModalProvider>
            <AppContent />
          </BottomSheetModalProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
