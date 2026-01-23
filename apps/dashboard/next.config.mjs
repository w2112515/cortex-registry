/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/gateway/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

export default nextConfig;
