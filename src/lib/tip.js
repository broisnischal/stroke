// Global styled tooltip. One shared pill element for the whole app, driven by
// event delegation: any element with a `data-tip="…"` (opt-in) OR a native
// `title="…"` (auto-upgraded) gets a themed high-contrast pill instead of the
// OS's unstyled tooltip — no per-element setup, so it's consistent everywhere.
//
// Motion follows the design principles: origin-aware entrance from the trigger,
// a strong ease-out curve, quick (≈150ms) with a faster exit, a shared open
// delay that's skipped when moving between adjacent targets so toolbars feel
// instant, plus reduced-motion, keyboard-focus and touch handling.

let host, pill, textEl, arrow
/** @type {Element | null} */ let current = null
let showTimer = 0
let lastHiddenAt = -Infinity
let visible = false
/** The trigger we're currently showing or arming a show for. Tracked directly
 * (not re-queried by selector) because we remove the element's `title` on hover,
 * so a `[title]` selector would no longer match it on the way out. */
let armed = /** @type {Element | null} */ (null)
/** Element whose native `title` we temporarily removed (to suppress the OS tooltip). */
let titleStashEl = /** @type {Element | null} */ (null)
let titleStashVal = ''

const OPEN_DELAY = 350   // first hover
const SKIP_WINDOW = 300  // reopen instantly if another tip closed within this
const GAP = 8            // px between trigger and pill

function build() {
  host = document.createElement('div')
  host.className = 'app-tip'
  host.setAttribute('role', 'tooltip')
  host.setAttribute('aria-hidden', 'true')
  host.dataset.show = 'false'
  pill = document.createElement('div')
  pill.className = 'app-tip__pill'
  textEl = document.createElement('span')
  arrow = document.createElement('span')
  arrow.className = 'app-tip__arrow'
  pill.appendChild(textEl)
  pill.appendChild(arrow)
  host.appendChild(pill)
  document.body.appendChild(host)
}

/** @param {Element} target */
function place(target) {
  const r = target.getBoundingClientRect()
  const pw = host.offsetWidth
  const ph = host.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Prefer below the trigger; flip above when there isn't room (e.g. status bar).
  const below = r.bottom + GAP + ph <= vh || r.top - GAP - ph < 0
  const y = below ? r.bottom + GAP : r.top - GAP - ph
  let x = r.left + r.width / 2 - pw / 2
  x = Math.max(6, Math.min(x, vw - pw - 6))
  host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  host.dataset.side = below ? 'bottom' : 'top'
  // Arrow + scale origin sit under the trigger's centre, clamped inside the pill.
  const ax = Math.max(10, Math.min(r.left + r.width / 2 - x, pw - 10))
  arrow.style.left = `${ax}px`
  pill.style.transformOrigin = `${ax}px ${below ? 'top' : 'bottom'}`
}

/** @param {Element} target @param {string} text */
function reveal(target, text) {
  current = target
  textEl.textContent = text
  host.dataset.instant = performance.now() - lastHiddenAt < SKIP_WINDOW ? 'true' : 'false'
  host.dataset.show = 'false'
  place(target) // measure + position while hidden
  requestAnimationFrame(() => { if (current === target) host.dataset.show = 'true' })
  visible = true
}

function hide() {
  clearTimeout(showTimer)
  armed = null
  current = null
  if (titleStashEl) { titleStashEl.setAttribute('title', titleStashVal); titleStashEl = null }
  if (visible) { host.dataset.show = 'false'; lastHiddenAt = performance.now(); visible = false }
}

/** @param {Element} t @param {boolean} suppressNative @returns {string} */
function labelFor(t, suppressNative) {
  const tip = t.getAttribute('data-tip')
  if (tip) return tip
  const title = t.getAttribute('title')
  if (!title) return ''
  // On pointer hover, remove `title` so the OS's own tooltip doesn't also appear.
  // On keyboard focus we keep it (the OS shows title on hover, not focus) so screen
  // readers still have it.
  if (suppressNative) { titleStashEl = t; titleStashVal = title; t.removeAttribute('title') }
  return title
}

/** Shared enter path for pointer + keyboard focus.
 * @param {Element} t @param {boolean} instant @param {boolean} suppressNative */
function enter(t, instant, suppressNative) {
  if (t === armed) return
  hide()
  const text = labelFor(t, suppressNative)
  if (!text) return
  armed = t
  const delay = instant || performance.now() - lastHiddenAt < SKIP_WINDOW ? 0 : OPEN_DELAY
  showTimer = window.setTimeout(() => reveal(t, text), delay)
}

/** Initialise the global tooltip. Returns a teardown fn. */
export function initTooltips() {
  if (host || typeof document === 'undefined') return () => {}
  build()

  const onOver = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType === 'touch') return
    // Still inside the armed trigger (whose title we've already removed) — do nothing.
    if (armed && e.target instanceof Node && armed.contains(e.target)) return
    const t = e.target instanceof Element ? e.target.closest('[data-tip],[title]') : null
    if (t) enter(t, false, true)
  }
  const onOut = (/** @type {PointerEvent} */ e) => {
    // Hide the moment the pointer leaves the armed trigger. Checked against the
    // tracked element (not a selector) because its `title` was removed on enter.
    if (!armed) return
    if (e.relatedTarget instanceof Node && armed.contains(e.relatedTarget)) return // moved within it
    if (e.target instanceof Node && armed.contains(e.target)) hide()
  }
  const onFocus = (/** @type {FocusEvent} */ e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-tip],[title]') : null
    if (t) enter(t, true, false)
  }
  const onDown = () => hide()
  const onScroll = () => { if (visible && current) place(current) }
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') hide() }

  document.addEventListener('pointerover', onOver, true)
  document.addEventListener('pointerout', onOut, true)
  document.addEventListener('focusin', onFocus, true)
  document.addEventListener('focusout', onDown, true)
  document.addEventListener('pointerdown', onDown, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('keydown', onKey, true)

  return () => {
    document.removeEventListener('pointerover', onOver, true)
    document.removeEventListener('pointerout', onOut, true)
    document.removeEventListener('focusin', onFocus, true)
    document.removeEventListener('focusout', onDown, true)
    document.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('keydown', onKey, true)
    clearTimeout(showTimer)
    host?.remove(); host = null
  }
}
