import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * These guard a failure mode that has already bitten twice: a list is extended
 * in one file and not its twin in another, and the mismatch stays invisible
 * until a user notices a missing option. Nothing in the type system relates the
 * two, so the check reads the source.
 *
 * Source is read rather than imported because settings.js pulls in
 * `mode-watcher`, which has no node export condition and cannot load here.
 */
const read = (/** @type {string} */ rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Contents of `const <name> = [ … ]`, up to the first closing bracket. */
function listBlock(/** @type {string} */ src, /** @type {string} */ name) {
  const start = src.indexOf(`const ${name}`)
  if (start === -1) throw new Error(`${name} not found — was it renamed?`)
  const end = src.indexOf(']', start)
  return src.slice(start, end)
}

describe('settings option lists stay in step with their consumers', () => {
  const settings = read('./stores/settings.js')

  it('offers every toolbar data view as a default', () => {
    // TableToolbar owns what a tab can switch to; DATA_VIEW_IDS owns what you
    // may pick as the default. 'erd' was added to the first and not the second,
    // so it was the one view you could open but never default to.
    const toolbarIds = [...listBlock(read('./components/TableToolbar.svelte'), 'DATA_VIEW_MODES')
      .matchAll(/id:\s*"([a-z-]+)"/g)].map((m) => m[1])
    const settingIds = [...listBlock(settings, 'DATA_VIEW_IDS')
      .matchAll(/'([a-z-]+)'/g)].map((m) => m[1])

    expect(toolbarIds.length).toBeGreaterThan(3)
    expect([...settingIds].sort()).toEqual([...toolbarIds].sort())
  })

  it('has defaults that are themselves valid options', () => {
    // A default outside its own list is silently rewritten on load, so the
    // setting looks like it resets itself for no reason.
    const defaultOf = (/** @type {string} */ name) =>
      settings.match(new RegExp(`const ${name} = '([a-z-]+)'`))?.[1]

    const viewIds = listBlock(settings, 'DATA_VIEW_IDS').match(/'[a-z-]+'/g) ?? []
    const alignIds = listBlock(settings, 'TABLE_ALIGN_OPTIONS').match(/id: '([a-z-]+)'/g) ?? []

    expect(viewIds.join()).toContain(`'${defaultOf('DEFAULT_DATA_VIEW')}'`)
    expect(alignIds.join()).toContain(`'${defaultOf('DEFAULT_TABLE_ALIGN')}'`)
  })

  it('registers every Tauri command the frontend invokes', () => {
    // A command added to commands.rs but never listed in the invoke_handler
    // compiles clean and fails only at runtime, on the one path that calls it.
    const api = read('./api.js')
    const lib = read('../../src-tauri/src/lib.rs')
    const invoked = new Set(
      [...api.matchAll(/\binv(?:oke)?\(\s*['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]),
    )
    // Handlers are listed as `<module>::<name>,` — commands.rs is only the
    // largest of several modules that contribute them (mcp, secrets, metrics…).
    const registered = new Set(
      [...lib.matchAll(/(?:^|\s)(?:[a-z_]+::)+([a-z0-9_]+),/g)].map((m) => m[1]),
    )
    expect(invoked.size).toBeGreaterThan(20)
    expect(registered.size).toBeGreaterThan(20)
    expect([...invoked].filter((n) => !registered.has(n))).toEqual([])
  })

  it('has no <a download> left outside the save-dialog helpers', () => {
    // WKWebView ignores `<a download>` on a blob URL, so an anchor download is
    // a button that silently does nothing in the desktop app. Every export now
    // goes through saveExportAs; svg-png.js keeps one as the browser fallback,
    // and export.js keeps one behind a dialog-first check.
    const files = [
      './components/BackupPage.svelte',
      './components/SqlConsole.svelte',
      './components/ChartView.svelte',
      './components/AiChartRenderer.svelte',
      './components/AiChat.svelte',
      './components/notebook/SqlCell.svelte',
      './components/EntityRelationPage.svelte',
      './components/MermaidViewer.svelte',
    ]
    const offenders = files.filter((f) => /\.download\s*=/.test(read(f)))
    expect(offenders).toEqual([])
  })
})
