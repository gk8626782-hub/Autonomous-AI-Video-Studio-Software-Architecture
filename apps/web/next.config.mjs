/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure static export: the server only hosts files.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: [
    "@avs/board",
    "@avs/core",
    "@avs/crypto",
    "@avs/i18n",
    "@avs/keys",
    "@avs/providers",
    "@avs/storage",
    "@avs/ui",
  ],
};

export default nextConfig;
