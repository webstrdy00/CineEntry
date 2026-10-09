module.exports = ({ config }) => {
  const release = process.env.NODE_ENV === "production"
    || ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE);

  if (release) {
    let endpoint;
    try {
      endpoint = new URL(process.env.EXPO_PUBLIC_API_URL);
    } catch {
      // Report only the variable name, never a possibly credential-bearing URL.
    }
    if (
      !endpoint
      || endpoint.protocol !== "https:"
      || endpoint.username
      || endpoint.password
      || endpoint.pathname !== "/"
      || endpoint.search
      || endpoint.hash
      || endpoint.hostname === "localhost"
      || endpoint.hostname.endsWith(".localhost")
      || endpoint.hostname.startsWith("127.")
      || endpoint.hostname === "[::1]"
    ) {
      throw new Error("Release builds require EXPO_PUBLIC_API_URL to be a non-local HTTPS API origin without credentials, a path, query, or fragment.");
    }
  }

  return config;
};
