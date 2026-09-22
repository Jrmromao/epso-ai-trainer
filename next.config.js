/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to THIS project. Avoids Next.js picking a stray
  // lockfile in the home dir (~/package-lock.json) as the root, which can
  // break build-tracing locally and on Vercel.
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
