import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { withBaseSegments } from './scripts/spaFallback.mjs'


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

// The GitHub Pages 404.html redirect must keep exactly the base's folders (see scripts/spaFallback.mjs).
function spaFallbackBase(base: string) {
  let outDir = 'dist'
  return {
    name: 'spa-fallback-base',
    apply: 'build' as const,
    configResolved(config: { build: { outDir: string } }) { outDir = path.resolve(__dirname, config.build.outDir) },
    writeBundle() {
      const file = path.join(outDir, '404.html')
      if (existsSync(file)) writeFileSync(file, withBaseSegments(readFileSync(file, 'utf8'), base))
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
    spaFallbackBase(SITE_BASE),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
}))
