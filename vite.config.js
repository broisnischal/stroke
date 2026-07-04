import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Workaround: @tailwindcss/vite (enforce:'pre') intercepts Svelte virtual CSS modules
// (?svelte&type=style&lang.css) before vite-plugin-svelte can populate the compiled CSS.
// When the parent component isn't in the module graph yet, Svelte's loadCompiledCss
// returns undefined, Vite falls back to reading the raw .svelte file, and Tailwind
// tries to parse Svelte source as CSS -> "Invalid declaration" error.
//
// Fix: pre-compile the parent .svelte module so the CSS meta is available, then guard
// the transform path so raw Svelte source never reaches Tailwind's CSS parser.
/** @type {import('vite').Plugin} */
const svelteVirtualCssFix = {
  name: 'svelte-virtual-css-fix',
  enforce: 'pre',
  async load(id) {
    if (!/\.svelte\?[^#]*type=style/.test(id)) return
    const svelteFile = id.split('?')[0]
    if (!this.getModuleInfo(svelteFile)?.meta?.svelte?.css) {
      try { await this.load({ id: svelteFile }) } catch {}
    }
    return null // hand off to vite-plugin-svelte:load-compiled-css
  },
  transform(code, id) {
    // Safety net: if Vite still served raw Svelte source as a CSS module,
    // return empty CSS so Tailwind's parser doesn't blow up.
    if (/\.svelte\?[^#]*type=style/.test(id) && /<script[\s>]/i.test(code)) {
      return { code: '' }
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelteVirtualCssFix,
    svelte({ compilerOptions: { runes: true } }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
  },
  server: {
    port: 8080,
    // The dev server may resolve node_modules from a parent dir (e.g. when running
    // from a git worktree that shares the repo's node_modules). Relax the fs
    // allow-list so those assets (fonts, etc.) serve instead of being blocked.
    // Dev-only — has no effect on `tauri build` / production.
    fs: { strict: false },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
