// app.config.js
export default ({ config }) => {
  return {
    ...config,
    extra: {
      ...(config.extra || {}), // preserve whatever EAS writes (eas.projectId)
      expoPublicBackend:
        process.env.EXPO_PUBLIC_BACKEND_BASE ||
        "https://ucs503p-202526odd-teamkhabu.onrender.com/"
    }
  };
};
