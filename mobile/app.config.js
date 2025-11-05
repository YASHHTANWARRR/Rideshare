// mobile/app.config.js
export default ({ config }) => ({
  ...config,
  name: "RideShare",
  slug: "mobile",

  android: {
    ...(config.android || {}),
    package: "com.cheesecake1005.rideshare",
    versionCode: 1,
  },

  ios: {
    ...(config.ios || {}),
    bundleIdentifier: "com.cheesecake1005.rideshare",
    supportsTablet: true,
  },

  // ✨ ADD/MERGE THIS
  plugins: [
    "expo-web-browser",   // <-- required by the update
    // "expo-router",      // (optional) if you still use expo-router, keep this too
  ],

  web: { ...(config.web || {}) },

  extra: {
    ...(config.extra || {}),
    eas: {
      ...(config.extra?.eas || {}),
      projectId: "f3862617-6905-4bce-8774-314a7df3bd4f",
    },
    expoPublicBackend:
      process.env.EXPO_PUBLIC_BACKEND_BASE ||
      "https://ucs503p-202526odd-teamkhabu.onrender.com/",
  },
});
