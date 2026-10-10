import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fallbackFiles } from './scripts/spaFallback.mjs'
import { canonicalHostScript } from './scripts/canonicalHost.mjs'


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

// Runs while dist/index.html is still the clean app shell (the prerender replaces it with the home page later):
// writes spa.html (Firebase Hosting serves it for app routes without a prerendered page) and 404.html — the
// GitHub Pages redirect with exactly the base's folders, or with SPA_FALLBACK=shell the app shell itself
// (see scripts/spaFallback.mjs).
function spaFallbackBase(base: string) {
  let outDir = 'dist'
  return {
    name: 'spa-fallback-base',
    apply: 'build' as const,
    configResolved(config: { build: { outDir: string } }) { outDir = path.resolve(__dirname, config.build.outDir) },
    writeBundle() {
      const page404 = path.join(outDir, '404.html')
      const files = fallbackFiles({
        indexHtml: readFileSync(path.join(outDir, 'index.html'), 'utf8'),
        page404: existsSync(page404) ? readFileSync(page404, 'utf8') : null,
        base,
        mode: process.env.SPA_FALLBACK,
      })
      for (const [name, html] of Object.entries(files)) writeFileSync(path.join(outDir, name), html)
    },
  }
}

// Sends visitors on the project's default Firebase Hosting addresses to SITE_URL (scripts/canonicalHost.mjs).
// Inert unless SITE_URL is a site at the root of its host, so the GitHub Pages build is unaffected.
function canonicalHost() {
  const siteUrl = process.env.SITE_URL || 'https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite'
  return {
    name: 'canonical-host',
    apply: 'build' as const,
    // Right after <meta charset> (which must stay in the first 1024 bytes), before anything starts loading.
    transformIndexHtml(html: string) {
      if (!/<meta charset[^>]*>/i.test(html)) throw new Error('index.html has no <meta charset> to place the canonical-host script after')
      return html.replace(/<meta charset[^>]*>/i, tag => `${tag}\n    <script>${canonicalHostScript(siteUrl)}</script>`)
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
    canonicalHost(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
}))
