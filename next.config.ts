import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */

  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/webpack'],
      },
    },
  },
  reactCompiler: true,
  experimental: {
    turbopackRustReactCompiler: true,
  },
};

export default nextConfig;
