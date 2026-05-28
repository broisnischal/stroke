/**
 * Uniform text-editing shortcuts for every plain input/textarea in the app:
 *   Ctrl/Cmd+Backspace        → delete the previous word
 *   Ctrl/Cmd+Shift+Backspace  → clear the whole field
 *   Ctrl/Cmd+Z                → undo
 *   Ctrl/Cmd+Shift+Z / Ctrl+Y → redo
 *
 * Monaco editors are skipped — they ship their own (richer) editing model.
 * Undo/redo is backed by a per-element stack so it behaves consistently across
 * platforms (mac's native Cmd+Z stack isn't reachable for synthetic edits).
 */

const MAX_STACK = 200
const COALESCE_MS = 350

/** @type {WeakMap<HTMLInputElement | HTMLTextAreaElement, { stack: string[], idx: number, t: number, suppress: boolean }>} */
const histories = new WeakMap()

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', ''])

/** @returns {el is HTMLInputElement | HTMLTextAreaElement} */
function isEditable(/** @type {Element} */ el) {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
  return false
}

function inMonaco(/** @type {Element} */ el) {
  return !!el.closest?.('.monaco-editor')
}

/** @param {HTMLInputElement | HTMLTextAreaElement} el */
function getHistory(el) {
  let h = histories.get(el)
  if (!h) {
    h = { stack: [el.value], idx: 0, t: 0, suppress: false }
    histories.set(el, h)
  }
  return h
}

/** Capture the element's current value as an undo step (with light time-based coalescing). */
function record(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el) {
  const h = getHistory(el)
  if (h.suppress) return
  const val = el.value
  if (val === h.stack[h.idx]) return
  const now = performance.now()
  if (now - h.t < COALESCE_MS && h.idx === h.stack.length - 1 && h.idx > 0) {
    h.stack[h.idx] = val // coalesce a burst of typing into one step
  } else {
    h.stack.length = h.idx + 1 // drop any redo tail
    h.stack.push(val)
    if (h.stack.length > MAX_STACK) h.stack.shift()
    h.idx = h.stack.length - 1
  }
  h.t = now
}

/** Programmatically set the value + caret and notify bindings, without re-recording. */
function applyValue(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el, value, caret) {
  const h = getHistory(el)
  h.suppress = true
  el.value = value
  const pos = caret ?? value.length
  try { el.setSelectionRange(pos, pos) } catch { /* number/unsupported */ }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  h.suppress = false
}

function undo(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el) {
  const h = getHistory(el)
  if (el.value !== h.stack[h.idx]) record(el) // commit any pending edit first
  if (h.idx <= 0) return
  h.idx--
  applyValue(el, h.stack[h.idx])
  h.t = 0
}

function redo(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el) {
  const h = getHistory(el)
  if (h.idx >= h.stack.length - 1) return
  h.idx++
  applyValue(el, h.stack[h.idx])
  h.t = 0
}

function deleteWord(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el) {
  const v = el.value
  const start = el.selectionStart ?? v.length
  const end = el.selectionEnd ?? start
  if (start !== end) {
    applyValue(el, v.slice(0, start) + v.slice(end), start)
    record(el)
    return
  }
  let i = start
  while (i > 0 && /\s/.test(v[i - 1])) i-- // eat trailing whitespace
  while (i > 0 && !/\s/.test(v[i - 1])) i-- // eat the word
  applyValue(el, v.slice(0, i) + v.slice(start), i)
  record(el)
}

function clearAll(/** @type {HTMLInputElement | HTMLTextAreaElement} */ el) {
  if (!el.value) return
  applyValue(el, '', 0)
  record(el)
}

/** @param {KeyboardEvent} e */
function onKeyDown(e) {
  if (e.isComposing) return
  const el = e.target
  if (!(el instanceof HTMLElement) || !isEditable(el) || inMonaco(el)) return
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const key = e.key.toLowerCase()

  if (key === 'backspace') {
    e.preventDefault()
    e.stopPropagation()
    if (e.shiftKey) clearAll(el)
    else deleteWord(el)
  } else if (key === 'z') {
    e.preventDefault()
    e.stopPropagation()
    if (e.shiftKey) redo(el)
    else undo(el)
  } else if (key === 'y' && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    redo(el)
  }
}

/** @param {Event} e */
function onInput(e) {
  const el = e.target
  if (!(el instanceof HTMLElement) || !isEditable(el) || inMonaco(el)) return
  record(/** @type {HTMLInputElement | HTMLTextAreaElement} */ (el))
}

/** Install global listeners. Returns a cleanup function. */
export function installInputShortcuts() {
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('input', onInput, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('input', onInput, true)
  }
}
