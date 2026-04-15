const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["snarkjs", "circomlibjs"],
  },
  webpack: (config) => {
    // ── Node.js built-ins not available in browser ────────────
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // ── Stub optional native / React-Native-only deps ─────────
    // @metamask/sdk pulls in @react-native-async-storage at build time
    // even though it's never used in a browser bundle.
    // pino-pretty is an optional peer dep of pino used by WalletConnect.
    // Both cause "Module not found" warnings that break HMR; replace with
    // an empty module so the import resolves without errors.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "src/lib/empty-module.js"
      ),
      "pino-pretty": path.resolve(__dirname, "src/lib/empty-module.js"),
      // idb-keyval is used by WalletConnect's key-value storage at module-init
      // time. During SSR there is no indexedDB, causing the repeated
      // "ReferenceError: indexedDB is not defined" in the terminal logs.
      // Stubbing it with an empty module silences the error; the real
      // idb-keyval is never actually needed server-side.
      "idb-keyval": path.resolve(__dirname, "src/lib/empty-module.js"),
    };

    // ── Allow snarkjs / circomlibjs WASM ──────────────────────
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    return config;
  },
};

module.exports = nextConfig;
