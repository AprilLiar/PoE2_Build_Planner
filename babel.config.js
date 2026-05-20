module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource wires NativeWind's JSX transform so className prop works
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      // nativewind/babel is a preset (not a plugin) — must stay in presets[]
      'nativewind/babel',
    ],
    // react-native-worklets/plugin is added automatically by babel-preset-expo
    // when react-native-worklets is installed, so no explicit plugins needed here
  };
};
