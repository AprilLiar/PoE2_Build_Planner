module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // NativeWind enables Tailwind CSS utility classes in React Native
      'nativewind/babel',
      // Reanimated plugin must always be listed last
      'react-native-reanimated/plugin',
    ],
  };
};
