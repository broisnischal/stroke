/** @typedef {{ start: number, end: number }} CharRange */
/** @typedef {{ start: number, end: number, url: string }} UrlRange */

export const JSON_URL_RE = /^https?:\/\/\S+$/i

/** @param {string} s */
export function escapeHtml(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// Matches one JSON token: a string, a literal (true/false/null), or a number.
// Whitespace and structural punctuation ({}[],:) fall through as plain gap text.
const JSON_TOKEN_RE = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

/**
 * Colorize a JSON snippet (typically a single line) into `.json-tok-*` spans
 * without any wrapper element - usable per-line by virtualized viewers.
 * @param {string} source @returns {string} safe HTML
 */
export function highlightJsonHtml(source) {
  const s = String(source ?? '')
  let out = ''
  let last = 0
  let m
  JSON_TOKEN_RE.lastIndex = 0
  while ((m = JSON_TOKEN_RE.exec(s)) !== null) {
    const tok = m[0]
    const start = m.index
    if (start > last) out += escapeHtml(s.slice(last, start))
    last = start + tok.length
    if (tok[0] === '"') {
      // Property key when the next non-space character is a colon.
      let j = last
      while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++
      out += `<span class="${s[j] === ':' ? 'json-tok-key' : 'json-tok-str'}">${escapeHtml(tok)}</span>`
    } else if (tok === 'true' || tok === 'false') {
      out += `<span class="json-tok-bool">${tok}</span>`
    } else if (tok === 'null') {
      out += `<span class="json-tok-null">${tok}</span>`
    } else {
      out += `<span class="json-tok-num">${tok}</span>`
    }
  }
  if (last < s.length) out += escapeHtml(s.slice(last))
  return out
}

/**
 * Lightweight, dependency-free JSON syntax colorizer. Single regex pass, no
 * TextMate grammar / wasm - a fast stand-in for shiki on the JSON viewing path.
 * Returns a `<pre>` whose tokens are wrapped in `.json-tok-*` spans (colored via
 * CSS vars in app.css). Text-node structure stays linkify-compatible.
 * @param {string} source @returns {string}
 */
export function highlightJson(source) {
  return `<pre>${highlightJsonHtml(source)}</pre>`
}

/** @param {string} text @param {number} quoteIndex */
function isEscapedQuote(text, quoteIndex) {
  let backslashes = 0
  let i = quoteIndex - 1
  while (i >= 0 && text[i] === '\\') {
    backslashes++
    i--
  }
  return backslashes % 2 === 1
}

/** @param {string} text @param {number} openIndex */
function findClosingQuoteIndex(text, openIndex) {
  if (text[openIndex] !== '"') return -1
  for (let i = openIndex + 1; i < text.length; i++) {
    if (text[i] === '"' && !isEscapedQuote(text, i)) return i
  }
  return -1
}

/** @param {string} text @param {number} openIndex @param {number} closeIndex */
function parseQuotedString(text, openIndex, closeIndex) {
  try {
    return JSON.parse(text.slice(openIndex, closeIndex + 1))
  } catch {
    return null
  }
}

/** @param {string} text @param {number} offset */
function findStringRangeContaining(text, offset) {
  for (let i = offset; i >= 0; i--) {
    if (text[i] !== '"' || isEscapedQuote(text, i)) continue
    const close = findClosingQuoteIndex(text, i)
    if (close === -1) continue
    if (offset >= i && offset <= close) return { start: i, end: close + 1 }
  }
  return null
}

/** @param {string} text @param {number} pos */
function findMatchingBracket(text, pos, open, close) {
  if (text[pos] !== open) return null
  let depth = 0
  let i = pos
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      const end = findClosingQuoteIndex(text, i)
      if (end === -1) return null
      i = end + 1
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return { start: pos, end: i + 1 }
    }
    i++
  }
  return null
}

/** @param {string} text @param {number} pos */
function findValueRangeAt(text, pos) {
  while (pos < text.length && /\s/.test(text[pos])) pos++
  if (pos >= text.length) return null

  const strRange = findStringRangeContaining(text, pos)
  if (strRange) {
    let after = strRange.end
    while (after < text.length && /\s/.test(text[after])) after++
    if (text[after] === ':') {
      return findValueRangeAt(text, after + 1)
    }
    return strRange
  }

  const c = text[pos]
  if (c === '{') return findMatchingBracket(text, pos, '{', '}')
  if (c === '[') return findMatchingBracket(text, pos, '[', ']')
  if (text.startsWith('true', pos)) return { start: pos, end: pos + 4 }
  if (text.startsWith('false', pos)) return { start: pos, end: pos + 5 }
  if (text.startsWith('null', pos)) return { start: pos, end: pos + 4 }

  const numMatch = text.slice(pos).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
  if (numMatch) return { start: pos, end: pos + numMatch[0].length }

  return null
}

/**
 * @param {string} text
 * @param {number} offset
 * @returns {CharRange | null}
 */
export function getJsonValueRangeAtOffset(text, offset) {
  if (!text || offset < 0) return null
  const clamped = Math.min(offset, text.length - 1)
  return findValueRangeAt(text, clamped)
}

/**
 * @param {string} text
 * @param {number} offset
 * @returns {string | null}
 */
export function getJsonUrlAtOffset(text, offset) {
  const range = getJsonValueRangeAtOffset(text, offset)
  if (!range) return null
  const slice = text.slice(range.start, range.end)
  if (slice[0] !== '"') return null
  const parsed = parseQuotedString(text, range.start, range.end - 1)
  if (typeof parsed !== 'string' || !JSON_URL_RE.test(parsed)) return null
  return parsed
}

/** @param {string} source @returns {UrlRange[]} */
export function findJsonUrlStringRanges(source) {
  /** @type {UrlRange[]} */
  const ranges = []
  let i = 0
  while (i < source.length) {
    if (source[i] !== '"') {
      i++
      continue
    }
    const close = findClosingQuoteIndex(source, i)
    if (close === -1) {
      i++
      continue
    }
    const parsed = parseQuotedString(source, i, close)
    if (typeof parsed === 'string' && JSON_URL_RE.test(parsed)) {
      ranges.push({ start: i, end: close + 1, url: parsed })
    }
    i = close + 1
  }
  return ranges
}

/**
 * @param {ParentNode} root
 * @param {number} targetOffset
 */
export function getTextOffsetInRoot(root, targetNode, targetOffset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    const len = node.textContent?.length ?? 0
    if (node === targetNode) return offset + targetOffset
    offset += len
  }
  return offset
}

/**
 * @param {ParentNode} root
 * @param {number} start
 * @param {number} end
 * @returns {{ startNode: Text, startOffset: number, endNode: Text, endOffset: number } | null}
 */
export function domRangeFromTextOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = 0
  /** @type {Text | null} */
  let startNode = null
  let startOffset = 0
  /** @type {Text | null} */
  let endNode = null
  let endOffset = 0

  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode)
    const len = node.textContent?.length ?? 0
    const nodeStart = offset
    const nodeEnd = offset + len

    if (!startNode && start >= nodeStart && start <= nodeEnd) {
      startNode = node
      startOffset = start - nodeStart
    }
    if (!endNode && end >= nodeStart && end <= nodeEnd) {
      endNode = node
      endOffset = end - nodeStart
    }
    if (startNode && endNode) break
    offset += len
  }

  if (!startNode || !endNode) return null
  return { startNode, startOffset, endNode, endOffset }
}

/**
 * @param {ParentNode} pre
 * @param {number} start
 * @param {number} end
 */
export function selectTextOffsets(pre, start, end) {
  const mapped = domRangeFromTextOffsets(pre, start, end)
  if (!mapped) return
  const range = document.createRange()
  range.setStart(mapped.startNode, mapped.startOffset)
  range.setEnd(mapped.endNode, mapped.endOffset)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * @param {HTMLElement} pre
 * @param {string} source
 */
export function linkifyJsonInElement(pre, source) {
  if (pre.dataset.linkified === source) return
  const urlRanges = findJsonUrlStringRanges(source)
  if (!urlRanges.length) {
    pre.dataset.linkified = source
    return
  }

  /** @type {{ node: Text, start: number, end: number, url: string }[]} */
  const nodeRanges = []
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
  let textOffset = 0

  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode)
    const len = node.textContent?.length ?? 0
    const nodeStart = textOffset
    const nodeEnd = textOffset + len

    for (const ur of urlRanges) {
      if (ur.end <= nodeStart || ur.start >= nodeEnd) continue
      const localStart = Math.max(0, ur.start - nodeStart)
      const localEnd = Math.min(len, ur.end - nodeStart)
      if (localEnd > localStart) {
        nodeRanges.push({ node, start: localStart, end: localEnd, url: ur.url })
      }
    }
    textOffset += len
  }

  for (const { node, start, end, url } of [...nodeRanges].reverse()) {
    const text = node.textContent ?? ''
    const before = text.slice(0, start)
    const linkText = text.slice(start, end)
    const after = text.slice(end)
    const parent = node.parentNode
    if (!parent) continue

    const frag = document.createDocumentFragment()
    if (before) frag.appendChild(document.createTextNode(before))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.textContent = linkText
    anchor.className = 'json-inspector-url'
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    frag.appendChild(anchor)
    if (after) frag.appendChild(document.createTextNode(after))
    parent.replaceChild(frag, node)
  }

  pre.dataset.linkified = source
}
