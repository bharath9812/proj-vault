/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js', '@supabase/ssr'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      { protocol: 'https', hostname: 'www.jabra.com' },
      { protocol: 'https', hostname: 'resource.logitech.com' },
      { protocol: 'https', hostname: 'www.cisco.com' },
      { protocol: 'https', hostname: 'www.crestron.com' },
      { protocol: 'https', hostname: 'www.yealink.com' },
      { protocol: 'https', hostname: 'www.peoplelinkvc.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'www.bhphotovideo.com' },
    ],
  },
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
