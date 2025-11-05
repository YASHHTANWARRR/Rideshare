// app.config.js
export default ({ config }) => ({
  ...config,
  name: "RideShare",
  slug: "mobile",
  android: {
    ...(config.android || {}),
    package: "com.cheesecake1005.rideshare", // <-- must be unique, all lowercase, no spaces
    versionCode: 1
  },
  ios: {
    ...(config.ios || {}),
    bundleIdentifier: "com.cheesecake1005.rideshare" // optional for later iOS builds
  },
  extra: {
    ...(config.extra || {}), // keep EAS fields like eas.projectId
    expoPublicBackend:
      process.env.EXPO_PUBLIC_BACKEND_BASE ||
      "https://ucs503p-202526odd-teamkhabu.onrender.com/"
  }
});
