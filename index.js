// Entry point for the bare workflow Expo app.
// registerRootComponent ensures the app works correctly in both
// development (npx expo run:android) and production builds.
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
