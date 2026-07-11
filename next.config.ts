import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source; Next transpiles them.
  transpilePackages: ["game-data"],
};

export default nextConfig;
