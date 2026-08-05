// Route clipboard access through Tauri's native clipboard plugin.
//
// In the macOS WKWebView, `navigator.clipboard.writeText` is frequently denied
// with `NotAllowedError` - including Monaco's *internal* copy - because the web
// Clipboard API needs a trusted gesture + focus the embedded webview doesn't
// always grant. The Tauri plugin sets the OS clipboard directly from Rust, with
// no such restriction, so we transparently patch `navigator.clipboard` to use it.
// Every existing `navigator.clipboard.writeText(...)` call site (and Monaco's)
// then works with no per-call changes.

let _installed = false

export async function installClipboardBridge() {
  if (_installed) return
  _installed = true

  const clip = /** @type {any} */ (navigator).clipboard
  if (!clip) return

  // Lazily load the Tauri plugin - absent in browser dev, where the native API
  // works fine, so we leave the clipboard untouched there.
  let tauriWrite = null
  let tauriRead = null
  try {
    const mod = await import('@tauri-apps/plugin-clipboard-manager')
    tauriWrite = mod.writeText
    tauriRead = mod.readText
  } catch {
    return
  }
  if (typeof tauriWrite !== 'function') return

  const nativeWrite = typeof clip.writeText === 'function' ? clip.writeText.bind(clip) : null
  const nativeRead = typeof clip.readText === 'function' ? clip.readText.bind(clip) : null

  try {
    clip.writeText = async (/** @type {any} */ text) => {
      const s = text == null ? '' : String(text)
      try {
        await tauriWrite(s)
      } catch (e) {
        // Native web API, then a hidden-textarea execCommand, as last resorts.
        if (nativeWrite) { try { await nativeWrite(s); return } catch {} }
        if (!execCommandCopy(s)) throw e
      }
    }
    if (typeof tauriRead === 'function') {
      clip.readText = async () => {
        try { return await tauriRead() } catch { return nativeRead ? nativeRead() : '' }
      }
    }

    // Monaco sniffs the UA for Safari, which WebKitGTK also matches, and installs
    // a Safari clipboard workaround: on *every* click and keydown in an editor it
    // calls `clipboard.write([new ClipboardItem({'text/plain': <deferred>})])`.
    // WebKitGTK rejects that with NotAllowedError, so Monaco logged the error and
    // cancelled the previous deferred - emitting a NotAllowedError plus an
    // unhandled "Canceled" rejection on every keystroke. Serving `write` from the
    // Tauri plugin makes it resolve quietly, and still copies the text if the
    // deferred is ever completed (Monaco's own copy path uses execCommand).
    let writeSeq = 0
    clip.write = async (/** @type {any} */ items) => {
      const seq = ++writeSeq
      try {
        const item = items && items[0]
        if (!item || typeof item.getType !== 'function') return
        if (item.types && item.types.length && !item.types.includes('text/plain')) return
        const part = await item.getType('text/plain')
        // A newer gesture superseded this one - don't clobber the clipboard.
        if (seq !== writeSeq) return
        await tauriWrite(typeof part === 'string' ? part : await part.text())
      } catch {
        // Deferred cancelled by a newer gesture, or a payload we can't serve.
      }
    }
  } catch {
    // `writeText` not reassignable in this engine - nothing more we can do.
  }
}

/** Synchronous hidden-textarea copy - the classic fallback, stays in-gesture. */
function execCommandCopy(/** @type {string} */ text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    const sel = document.getSelection()
    const prevRange = sel && sel.rangeCount ? sel.getRangeAt(0) : null
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (prevRange && sel) { sel.removeAllRanges(); sel.addRange(prevRange) }
    return ok
  } catch {
    return false
  }
}
