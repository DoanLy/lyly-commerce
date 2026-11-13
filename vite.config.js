import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the same API router used by the Vercel function is mounted on /api.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const { handle } = await server.ssrLoadModule('/server/router.js')
        handle(req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), localApi()],
    server: { port: 5180 },
    build: { chunkSizeWarningLimit: 900 },
  }
})
