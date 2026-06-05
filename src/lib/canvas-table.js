// Pure rendering + geometry helpers for the canvas-based DataTable.
//
// This module owns everything that does NOT need Svelte reactivity:
//   • theme colour resolution (reads computed CSS so light/dark themes work)
//   • lucide-ish icon + checkbox drawing primitives
//   • column geometry (gutters, pinned/frozen columns, collapsed strips)
//   • row vertical offsets (fixed-height rows + variable expanded rows)
//   • hit-testing (viewport x/y → column / row)
//
// The component (`DataTable.svelte`) keeps all interactive state and the master
// draw loop, and calls into these helpers. Keeping them pure makes the geometry
// the single source of truth shared by both drawing and hit-testing, so a click
// always lands on the cell the user sees.

// ── Theme colours ───────────────────────────────────────────────────────────
// Canvas can't use CSS classes, so we resolve the computed colour of each token
// once per draw via a hidden probe element. Values are cached by expression for
// the lifetime of the reader (call `createColorReader` again after a theme flip
// — the component recreates it on a theme-change tick).

/** @param {HTMLElement} probe A 0×0 element living inside the table container. */
export function createColorReader(probe) {
  /** @type {Map<string, string>} */
  const cache = new Map();
  // A scratch 2D context normalises whatever the engine serialises (oklch /
  // oklab / rgb / hex) into a canvas-native string (#rrggbb or rgba(...)), so
  // downstream alpha math is always reliable.
  const scratch = /** @type {HTMLCanvasElement} */ (document.createElement("canvas")).getContext("2d");
  return (/** @type {string} */ expr) => {
    const hit = cache.get(expr);
    if (hit !== undefined) return hit;
    probe.style.color = expr;
    // getComputedStyle resolves var()/oklch/hsl to a concrete computed colour.
    let resolved = getComputedStyle(probe).color || "rgb(0,0,0)";
    if (scratch) {
      try {
        scratch.fillStyle = "#010203"; // sentinel
        scratch.fillStyle = resolved;
        // If the canvas couldn't parse it, fillStyle keeps the sentinel.
        if (scratch.fillStyle !== "#010203") resolved = scratch.fillStyle;
      } catch {
        /* keep the computed string */
      }
    }
    cache.set(expr, resolved);
    return resolved;
  };
}

// Memoize results — (colour, alpha) combos are few and stable, but this runs in
// the per-frame draw loop, so caching avoids repeated regex parsing on scroll.
/** @type {Map<string, string>} */
const _alphaCache = new Map();

/**
 * Apply an alpha to a CSS colour string regardless of notation (rgb/rgba/hsl,
 * functional space-separated, oklch/oklab/color(), or hex). Returns a string
 * the canvas understands.
 */
export function withAlpha(/** @type {string} */ color, /** @type {number} */ a) {
  const key = color + "@" + a;
  const cached = _alphaCache.get(key);
  if (cached !== undefined) return cached;
  const out = _computeAlpha(color, a);
  _alphaCache.set(key, out);
  return out;
}

function _computeAlpha(/** @type {string} */ color, /** @type {number} */ a) {
  const c = color.trim();
  const fnMatch = c.match(/^([a-z]+)\((.*)\)$/i);
  if (fnMatch) {
    const fn = fnMatch[1].toLowerCase();
    let inner = fnMatch[2];
    const slash = inner.lastIndexOf("/");
    if (slash !== -1) inner = inner.slice(0, slash).trim(); // drop existing alpha
    /** @type {Record<string, string>} */
    const commaFns = { rgb: "rgba", rgba: "rgba", hsl: "hsla", hsla: "hsla" };
    if (commaFns[fn] && inner.includes(",")) return `${commaFns[fn]}(${inner}, ${a})`;
    return `${fn}(${inner} / ${a})`;
  }
  if (c[0] === "#") {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return c;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return c;
}

// ── Icons ─────────────────────────────────────────────────────────────────
// A small registry of lucide path data (24×24 viewBox, stroke-based). Compiled
// to Path2D lazily and cached.
/** @type {Record<string, string[]>} */
const ICON_PATHS = {
  "chevron-right": ["m9 18 6-6-6-6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "chevrons-down-up": ["m7 20 5-5 5 5", "m7 4 5 5 5-5"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  "external-link": ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  "maximize-2": ["M15 3h6v6", "M9 21H3v-6", "m21 3-7 7", "m3 21 7-7"],
  braces: [
    "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1",
    "M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
  ],
  copy: [
    "M9 9m0 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2Z",
    "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  ],
  "arrow-up": ["M12 19V5", "m5 12 7-7 7 7"],
  "arrow-down": ["M12 5v14", "m19 12-7 7-7-7"],
  "arrow-up-down": ["m21 16-4 4-4-4", "M17 20V4", "m3 8 4-4 4 4", "M7 4v16"],
};

/** @type {Map<string, Path2D[]>} */
const _pathCache = new Map();
/** @param {string} name */
function iconPaths(name) {
  let p = _pathCache.get(name);
  if (!p) {
    p = (ICON_PATHS[name] ?? []).map((d) => new Path2D(d));
    _pathCache.set(name, p);
  }
  return p;
}

/**
 * Stroke a registered icon at (x, y) scaled to `size` px (lucide 24-unit space).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawIcon(ctx, name, x, y, size, color, lineWidth = 2) {
  const paths = iconPaths(name);
  if (!paths.length) return;
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / s;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const p of paths) ctx.stroke(p);
  ctx.restore();
}

/** Rounded-rect path on the current context. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw a checkbox centered in a `box` px square at (x, y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ checked?: boolean, indeterminate?: boolean }} state
 * @param {{ border: string, fill: string, mark: string }} colors
 */
export function drawCheckbox(ctx, x, y, box, state, colors) {
  const size = 15;
  const ox = x + (box - size) / 2;
  const oy = y + (box - size) / 2;
  ctx.save();
  if (state.checked || state.indeterminate) {
    ctx.fillStyle = colors.fill;
    roundRect(ctx, ox, oy, size, size, 4);
    ctx.fill();
    if (state.indeterminate) {
      ctx.strokeStyle = colors.mark;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ox + 4, oy + size / 2);
      ctx.lineTo(ox + size - 4, oy + size / 2);
      ctx.stroke();
    } else {
      // checkmark
      ctx.strokeStyle = colors.mark;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ox + 3.5, oy + 8);
      ctx.lineTo(ox + 6.5, oy + 11);
      ctx.lineTo(ox + 11.5, oy + 4.5);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.4;
    roundRect(ctx, ox + 0.7, oy + 0.7, size - 1.4, size - 1.4, 4);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a small column-metadata badge chip (pk/fk/unique/indexed/notnull).
 * Lettered chips read clearly at this size; the canvas tooltip restores the
 * full label on hover.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ bg: string, fg: string, letter: string, dot?: boolean }} spec
 */
export function drawBadge(ctx, x, y, size, spec) {
  ctx.save();
  ctx.fillStyle = spec.bg;
  roundRect(ctx, x, y, size, size, 2.5);
  ctx.fill();
  ctx.fillStyle = spec.fg;
  if (spec.dot) {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.font = `600 ${Math.round(size * 0.62)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.letter, x + size / 2 + 0.3, y + size / 2 + 0.5);
  }
  ctx.restore();
}

/** Filled triangle pointing up/down — the sort indicator + chevrons. */
export function drawTriangle(ctx, cx, cy, r, dir, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (dir === "up") {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx - r, cy + r);
  } else {
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy - r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Column geometry ─────────────────────────────────────────────────────────

/**
 * Compute per-column horizontal geometry in absolute *content* coordinates
 * (0 = far left, before horizontal scroll). Pinned columns keep their content
 * slot but get a `pinnedFixedX` resting position so they freeze to the left.
 *
 * @param {object} o
 * @param {{ name: string, dataType: string }[]} o.columns Visible columns in order.
 * @param {(name: string) => number} o.widthOf Resolved px width (handles collapse).
 * @param {(name: string) => boolean} o.isPinned
 * @param {number} o.gutterWidth Total px of the left gutters (expand + select).
 */
export function computeColumnGeometry({ columns, widthOf, isPinned, gutterWidth }) {
  /** @type {{ name: string, dataType: string, contentX: number, w: number, pinned: boolean }[]} */
  const cols = [];
  let contentX = gutterWidth;
  for (const c of columns) {
    const w = widthOf(c.name);
    cols.push({ name: c.name, dataType: c.dataType, contentX, w, pinned: isPinned(c.name) });
    contentX += w;
  }
  const totalWidth = contentX;
  let pinX = gutterWidth;
  /** @type {Map<string, number>} */
  const pinnedFixedX = new Map();
  for (const col of cols) {
    if (col.pinned) {
      pinnedFixedX.set(col.name, pinX);
      pinX += col.w;
    }
  }
  return { cols, totalWidth, pinnedFixedX, frozenWidth: pinX, gutterWidth };
}

/** Viewport x where a column is actually painted, given horizontal scroll. */
export function colDrawnX(col, geom, scrollLeft) {
  const base = col.contentX - scrollLeft;
  if (col.pinned) return Math.max(base, geom.pinnedFixedX.get(col.name) ?? 0);
  return base;
}

/**
 * Hit-test a viewport x → the column under it (pinned columns win, matching
 * paint order). Returns null when x is over a gutter or empty space.
 * Pass frozenLeft=0 when gutters are non-sticky (scroll with content).
 * @returns {{ col: any, drawnX: number } | null}
 */
export function colAtX(x, geom, scrollLeft, frozenLeft = geom.gutterWidth) {
  if (x < frozenLeft) return null;
  // Pinned columns are painted last (on top); test them first, rightmost first.
  for (let i = geom.cols.length - 1; i >= 0; i--) {
    const col = geom.cols[i];
    if (!col.pinned) continue;
    const dx = colDrawnX(col, geom, scrollLeft);
    if (x >= dx && x < dx + col.w) return { col, drawnX: dx };
  }
  for (const col of geom.cols) {
    if (col.pinned) continue;
    const dx = col.contentX - scrollLeft;
    if (x >= frozenLeft && x >= dx && x < dx + col.w) return { col, drawnX: dx };
  }
  return null;
}

/**
 * Detect a column-resize target near a column's right border in the header.
 * Returns the column name whose edge is within `slop` px of x, or null.
 * Pass frozenLeft=0 when gutters are non-sticky.
 */
export function resizeColAtX(x, geom, scrollLeft, slop = 5, frozenLeft = geom.gutterWidth) {
  const order = geom.cols.filter((c) => c.pinned).concat(geom.cols.filter((c) => !c.pinned));
  for (const col of order) {
    const edge = colDrawnX(col, geom, scrollLeft) + col.w;
    if (edge < frozenLeft - 0.5) continue;
    if (Math.abs(x - edge) <= slop) return col.name;
  }
  return null;
}

// ── Row geometry ──────────────────────────────────────────────────────────

/**
 * Cumulative top offset of every row. Fixed `rowHeight` rows, plus expand height
 * for each expanded row. Per-row measured heights are used when available;
 * `defaultExpandHeight` is the fallback before measurement.
 * @param {Set<number>} expandedSet
 * @param {Map<number,number> | null} expandHeights Per-row measured heights (optional).
 * @returns {Float64Array} length rowCount+1; [rowCount] is the total height.
 */
export function computeRowTops(rowCount, expandedSet, defaultExpandHeight, rowHeight, expandHeights = null) {
  const tops = new Float64Array(rowCount + 1);
  let y = 0;
  for (let i = 0; i < rowCount; i++) {
    tops[i] = y;
    y += rowHeight + (expandedSet.has(i) ? (expandHeights?.get(i) ?? defaultExpandHeight) : 0);
  }
  tops[rowCount] = y;
  return tops;
}

/** Largest row index with top ≤ y (binary search). */
export function rowIndexAtY(tops, rowCount, y) {
  if (rowCount === 0 || y < 0) return 0;
  let lo = 0, hi = rowCount - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= y) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}

/**
 * Map a content-space y to a row. `inRowBody` distinguishes the fixed row strip
 * from the expanded-detail area below it (which is a DOM overlay, not canvas).
 * @returns {{ idx: number, inRowBody: boolean } | null}
 */
export function rowAtContentY(tops, rowCount, rowHeight, y) {
  if (rowCount === 0 || y < 0 || y >= tops[rowCount]) return null;
  const idx = rowIndexAtY(tops, rowCount, y);
  return { idx, inRowBody: y < tops[idx] + rowHeight };
}
