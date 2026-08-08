import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Svelte's lifecycle functions are ordinary imports, not globals — but nothing
 * in the toolchain says so. The compiler treats an unimported `onDestroy` as a
 * free variable and emits it verbatim; `vite build` succeeds; `svelte-check`
 * reports zero errors, because these script blocks are plain JS with no
 * `checkJs`. The failure surfaces only when the component mounts, as
 * "Can't find variable: onDestroy" over a crash screen.
 *
 * That happened (issue #78), so the guard is here rather than in a linter that
 * would have to be adopted wholesale to catch one deterministic mistake.
 */
const RUNTIME_API = [
  'onMount',
  'onDestroy',
  'beforeUpdate',
  'afterUpdate',
  'tick',
  'untrack',
  'getContext',
  'setContext',
  'hasContext',
  'getAllContexts',
  'createEventDispatcher',
  'mount',
  'unmount',
  'flushSync',
]

/** @param {string} dir @returns {string[]} */
function svelteFiles(dir) {
  /** @type {string[]} */
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...svelteFiles(full))
    else if (entry.endsWith('.svelte')) out.push(full)
  }
  return out
}

describe('svelte lifecycle imports', () => {
  const files = svelteFiles('src')

  it('finds components to check', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('every component that calls a lifecycle function imports it', () => {
    /** @type {string[]} */
    const missing = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // Only the <script> blocks: `onMount` inside markup or a comment is not a call.
      const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
      if (!scripts.length) continue
      // Comments are stripped first: prose about a component's own lifecycle
      // ("the parent holds this closure past unmount (…)") is exactly the shape
      // being searched for, and every match in this codebase was one.
      const code = scripts
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')

      // What this file pulls out of 'svelte', in any import form.
      const imported = new Set()
      for (const m of code.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"]svelte['"]/g)) {
        for (const part of (m[1] ?? m[2] ?? '').split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim()
          if (name) imported.add(name)
        }
      }

      for (const api of RUNTIME_API) {
        if (imported.has(api)) continue
        // A call, not a mention: `onDestroy(` at an identifier boundary, and not
        // as a property (`this.tick(`) or a declaration of the same name.
        const called = new RegExp(`(?<![.\\w$])${api}\\s*\\(`).test(code)
        const declared = new RegExp(`(?:function|const|let|var)\\s+${api}\\b`).test(code)
        if (called && !declared) missing.push(`${file}: ${api}() called but not imported from 'svelte'`)
      }
    }

    expect(missing).toEqual([])
  })
})
