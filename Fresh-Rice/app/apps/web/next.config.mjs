/** @type {import('next').NextConfig} */
const API = process.env.API_INTERNAL_URL || 'http://localhost:4100';
const nextConfig = {
  reactStrictMode: true,
  // Hostnames allowed to hit the dev server's /_next/* (HMR, chunks). Without this, opening the
  // dev build through the public domain logs cross-origin warnings and breaks hot reload.
  allowedDevOrigins: ['freshrice.aetosiot.com', '192.168.29.101', 'localhost'],
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '' },
  async rewrites() { return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }, { source: '/docs', destination: `${API}/docs` }, { source: '/docs-json', destination: `${API}/docs-json` }]; },
};
export default nextConfig;
