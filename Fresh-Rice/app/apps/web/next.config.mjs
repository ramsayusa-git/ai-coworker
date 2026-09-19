/** @type {import('next').NextConfig} */
const API = process.env.API_INTERNAL_URL || 'http://localhost:4100';
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '' },
  async rewrites() { return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }, { source: '/docs', destination: `${API}/docs` }, { source: '/docs-json', destination: `${API}/docs-json` }]; },
};
export default nextConfig;
