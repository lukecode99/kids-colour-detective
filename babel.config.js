module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Compiles the 'worklet' frame-processor functions (CD-10 vision-camera
    // scan loop) so they can run on the camera thread.
    plugins: ['react-native-worklets-core/plugin'],
  };
};
