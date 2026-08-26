// The sandbox a third-party formatter runs in.
//
// A Worker already has no DOM, no `window`, and no Tauri bridge, so a plugin
// here cannot touch the app, the connection, or the screen. What it *would*
// still have is the network, so every global that can open one is removed
// before the plugin's code is evaluated. That is the whole fence: a plugin gets
// values in and returns render directives out, and nothing else.
//
// The protocol is batched on purpose. Formatters are consulted per visible cell
// per repaint, so a message per cell would be hopeless; the host sends the
// distinct values of one column and gets an array of directives back.

import { sanitizeDirective, safeString } from './sanitize.js'

/** Everything a plugin could reach the outside world with. */
function sealGlobals() {
  const blocked = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
    'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Notification',
    'localStorage', 'sessionStorage',
  ]
  for (const name of blocked) {
    try {
      Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false })
    } catch {
      // Some runtimes refuse to redefine a global; deleting is the fallback.
      try { delete self[name] } catch { /* nothing else to try */ }
    }
  }
  try {
    Object.defineProperty(self, 'navigator', {
      value: Object.freeze({ userAgent: 'Stroke plugin sandbox' }),
      configurable: false,
      writable: false,
    })
  } catch { /* not fatal - navigator alone opens nothing */ }
}

/** @type {{ appliesTo?: Function, format?: Function, id?: string } | null} */
let plugin = null
/** @type {Record<string, unknown>} */
let config = {}

/**
 * Evaluate the plugin's entry file. It runs as a CommonJS-style module - assign
 * to `module.exports` - rather than an ES module: dynamic `import()` of a blob
 * URL is uneven across the webviews this app ships on, and a plain function
 * body works the same everywhere with no bundler in the plugin author's way.
 * @param {string} code
 */
function evaluate(code) {
  const module = { exports: {} }
  const api = Object.freeze({
    apiVersion: 1,
    // A plugin's only channel back to the app, and it is one-way.
    log: (...args) => self.postMessage({ t: 'log', args: args.map((a) => safeString(String(a)) ?? '') }),
  })
  // eslint-disable-next-line no-new-func
  const factory = new Function('stroke', 'module', 'exports', `"use strict";\n${code}`)
  factory(api, module, module.exports)
  const exported = /** @type {any} */ (module.exports)
  return exported?.default ?? exported
}

self.onmessage = (/** @type {MessageEvent} */ event) => {
  const msg = event.data
  if (!msg || typeof msg !== 'object') return

  try {
    if (msg.t === 'load') {
      sealGlobals()
      config = msg.config ?? {}
      plugin = evaluate(String(msg.code ?? ''))
      if (!plugin || typeof plugin.format !== 'function') {
        throw new Error('the plugin does not export a format(value, ctx) function')
      }
      // Echo reqId: the host matches every reply to the call that asked for it,
      // and a reply without one is a reply nobody is waiting for.
      self.postMessage({ t: 'ready', reqId: msg.reqId, hasAppliesTo: typeof plugin.appliesTo === 'function' })
      return
    }

    if (msg.t === 'config') {
      config = msg.config ?? {}
      return
    }

    if (msg.t === 'applies') {
      // One answer per column, so the host can stop asking about columns this
      // plugin has no opinion on.
      const applies = (msg.columns ?? []).map((/** @type {any} */ c) => {
        if (!plugin) return false
        if (typeof plugin.appliesTo !== 'function') return true
        try {
          return !!plugin.appliesTo(String(c?.type ?? ''), String(c?.name ?? ''), config)
        } catch {
          return false
        }
      })
      self.postMessage({ t: 'applies', reqId: msg.reqId, applies })
      return
    }

    if (msg.t === 'format') {
      const ctx = { type: String(msg.type ?? ''), name: String(msg.name ?? ''), config }
      const directives = (msg.values ?? []).map((/** @type {unknown} */ v) => {
        if (!plugin) return null
        try {
          return sanitizeDirective(plugin.format(v, ctx))
        } catch {
          // One bad value must not fail the batch: the cell simply renders plain.
          return null
        }
      })
      self.postMessage({ t: 'format', reqId: msg.reqId, directives })
      return
    }
  } catch (err) {
    self.postMessage({ t: 'error', reqId: msg.reqId, message: String(err?.message ?? err) })
  }
}
