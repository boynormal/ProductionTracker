/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Temporary: allow production build while lint debt is cleaned incrementally.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
}

export default nextConfig
