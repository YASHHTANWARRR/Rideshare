// app.config.js
export default ({ config }) => {
  return {
    ...config,
    extra: {
      expoPublicBackend:
        process.env.EXPO_PUBLIC_BACKEND_BASE || "https://ucs503p-202526odd-teamkhabu.onrender.com/"
    }
  };
};
