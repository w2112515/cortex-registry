/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/gateway/:path*',
        destination: 'http://127.0.0.1:3001/:path*',
      },
    ];
  },
};

export default nextConfig;
