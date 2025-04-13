const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Add fallback for 'fs' module on the client side
      config.resolve.fallback = { fs: false };

      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: "scripts",
              to: "scripts",
            },
          ],
        })
      );
    }
    return config;
  },
};

module.exports = nextConfig;
