import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './RootStackNavigator';

// A ref to the root NavigationContainer — used to navigate from outside screen components.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
