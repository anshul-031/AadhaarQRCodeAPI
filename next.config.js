const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
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
  // Add environment variables that should be available on the client
  env: {
    NEXT_PUBLIC_DYNAMSOFT_LICENSE: process.env.NEXT_PUBLIC_DYNAMSOFT_LICENSE,
  },
};

module.exports = nextConfig;
