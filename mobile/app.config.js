// mobile/app.config.js
export default ({ config }) => ({
  ...config,
  name: "RideShare",
  slug: "mobile",

  android: {
    ...(config.android || {}),
    package: "com.cheesecake1005.rideshare",
    versionCode: 1,
    // no adaptiveIcon images
  },

  ios: {
    ...(config.ios || {}),
    bundleIdentifier: "com.cheesecake1005.rideshare",
    supportsTablet: true
  },

  // no global icon / favicon
  web: { ...(config.web || {}) },

  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: "#ffffff", resizeMode: "contain" }]
  ],

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
