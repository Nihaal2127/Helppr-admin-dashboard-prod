const path = require("path");

module.exports = function override(config, env) {
  // Fix resolution of React JSX runtime in strict ESM modules like @floating-ui/react
  config.resolve = config.resolve || {};
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    "react/jsx-runtime": "react/jsx-runtime.js",
    "react/jsx-dev-runtime": "react/jsx-dev-runtime.js",
  };
  // Some dependencies ship sourceMappingURL pointing at files not published in the package (ENOENT noise).
  config.ignoreWarnings = [
    ...(config.ignoreWarnings || []),
    /Failed to parse source map/,
  ];

  if (env === "development") {
    // Reuse compiled modules between restarts (big win on Windows + large src tree).
    config.cache = {
      type: "filesystem",
      buildDependencies: {
        config: [__filename],
      },
      cacheDirectory: path.resolve(__dirname, "node_modules/.cache/webpack"),
    };

    // Type-check in the editor; full check still runs on `npm run build`.
    config.plugins = config.plugins.filter(
      (plugin) =>
        plugin?.constructor?.name !== "ForkTsCheckerWebpackPlugin" &&
        plugin?.constructor?.name !== "ForkTsCheckerWarningWebpackPlugin"
    );
  }

  return config;
};
