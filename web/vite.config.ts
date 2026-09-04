import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves a project site from /<repo>/, so the base path has to
// match. Set VITE_BASE in the workflow; it defaults to '/' for local dev and
// for a user/organisation page served from the domain root.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
})
