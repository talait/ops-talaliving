/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Prototype: jangan blokir build karena lint. Type-safety dijaga via `tsc`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
