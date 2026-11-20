/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure static export: the server only hosts files.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ["@avs/core", "@avs/storage", "@avs/ui"],
};

export default nextConfig;
