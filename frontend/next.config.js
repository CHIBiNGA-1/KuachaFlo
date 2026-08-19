/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No rewrites/proxy on purpose: Next's dev-server proxy resets the
  // connection on slow requests (like OCR uploads), causing "socket hang
  // up". The browser calls the backend directly instead — see lib/api.ts.
  // This works because docker-compose publishes the backend's port to your
  // host machine, so http://localhost:8000 is reachable from the browser
  // whether you're running via Docker or bare-metal.
};

module.exports = nextConfig;
