import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// On GitHub Pages the site lives under /LyricalmyricalWebsite/.
// In dev (and on a custom domain) it lives at the root.
// SITE_BASE can be overridden via env (e.g. for a future custom domain).
const SITE_BASE = process.env.SITE_BASE ?? '/LyricalmyricalWebsite/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? SITE_BASE : '/',
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
}))
