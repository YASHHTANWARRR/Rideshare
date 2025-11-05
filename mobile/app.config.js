// mobile/app.config.js
export default ({ config }) => ({
  ...config,
  name: "RideShare",
  slug: "mobile",
  android: {
    ...(config.android || {}),
    package: "com.cheesecake1005.rideshare",
    versionCode: 1,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png"
    }
  },
  ios: {
    ...(config.ios || {}),
    bundleIdentifier: "com.cheesecake1005.rideshare",
    supportsTablet: true
  },
  extra: {
    ...(config.extra || {}),
    eas: {
      ...(config.extra?.eas || {}),
      projectId: "f3862617-6905-4bce-8774-314a7df3bd4f"   // <-- REQUIRED for GitHub builds
    },
    expoPublicBackend:
      process.env.EXPO_PUBLIC_BACKEND_BASE ||
      "https://ucs503p-202526odd-teamkhabu.onrender.com/",
  }
});
