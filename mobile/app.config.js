// mobile/app.config.js
export default ({ config }) => ({
  ...config,
  name: "RideShare",
  slug: "mobile",

  // --- ANDROID IDs only (no icons) ---
  android: {
    ...(config.android || {}),
    package: "com.cheesecake1005.rideshare",
    versionCode: 1,
    // ❌ adaptiveIcon block removed (no image files required)
  },

  // --- iOS ID only (no icons) ---
  ios: {
    ...(config.ios || {}),
    bundleIdentifier: "com.cheesecake1005.rideshare",
    supportsTablet: true
  },

  // ❌ global "icon" removed
  // ❌ web.favicon removed
  web: { ...(config.web || {}) },

  // plugins: keep only what you need (no splash images)
  plugins: [
    "expo-router",
    // Keep splash plugin but without image paths (uses default)
    ["expo-splash-screen", { backgroundColor: "#ffffff", resizeMode: "contain" }]
  ],

  // keep EAS project link + backend URL
  extra: {
    ...(config.extra || {}),
    eas: {
      ...(config.extra?.eas || {}),
      projectId: "f3862617-6905-4bce-8774-314a7df3bd4f"
    },
    expoPublicBackend:
      process.env.EXPO_PUBLIC_BACKEND_BASE ||
      "https://ucs503p-202526odd-teamkhabu.onrender.com/"
  }
});
