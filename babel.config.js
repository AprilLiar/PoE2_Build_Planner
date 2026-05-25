module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/plugin and react-native-worklets/plugin are added
    // automatically by babel-preset-expo when those packages are installed.
    // NativeWind is installed but not yet used — add it here when className props
    // are needed (also requires metro.config.js withNativeWind + global.css).
  };
};
