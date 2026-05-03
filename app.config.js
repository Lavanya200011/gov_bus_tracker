const googleMapsAndroidApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;

module.exports = ({ config }) => {
  const androidConfig = { ...(config.android?.config || {}) };

  if (googleMapsAndroidApiKey) {
    androidConfig.googleMaps = {
      ...(androidConfig.googleMaps || {}),
      apiKey: googleMapsAndroidApiKey,
    };
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: androidConfig,
    },
  };
};
