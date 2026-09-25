import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  webpack(config) {
    // Explicit '@/…' alias (tsconfig paths alone don't resolve reliably on this Windows setup).
    config.resolve.alias['@'] = root
    return config
  },
}
export default nextConfig
