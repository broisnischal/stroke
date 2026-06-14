import 'slot-text/style.css'
import { slotText } from 'slot-text'

/**
 * Svelte action: roll-animate an element's text whenever the bound value
 * changes — a small tactile effect for live counters and labels.
 *
 * Usage: `<span use:slotRoll={String(count)}></span>`
 *
 * @param {HTMLElement} node
 * @param {string | number} text
 */
export function slotRoll(node, text) {
  let prev = String(text ?? '')
  const ctrl = slotText(node, prev)
  return {
    /** @param {string | number} next */
    update(next) {
      const val = String(next ?? '')
      if (val === prev) return
      // Numeric values roll in the direction they moved; everything else rolls up.
      const numeric = !Number.isNaN(Number(val)) && !Number.isNaN(Number(prev))
      const direction = numeric && Number(val) < Number(prev) ? 'down' : 'up'
      ctrl.set(val, { direction })
      prev = val
    },
    destroy() {
      ctrl.destroy()
    },
  }
}
