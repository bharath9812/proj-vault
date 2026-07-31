/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js', '@supabase/ssr'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable persistent file caching in dev mode to eliminate missing dynamic chunk errors (e.g. ./885.js)
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
