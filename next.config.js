/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove the static export configuration
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;