import { createNavigationContainerRef } from '@react-navigation/native';
import { DrawerParamList } from './DrawerNavigator';

// A ref to the NavigationContainer used to navigate from outside of any screen component.
export const navigationRef = createNavigationContainerRef<DrawerParamList>();
