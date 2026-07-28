/**
 * Editor-group / split-pane layout model for the workspace.
 *
 * The layout is a binary tree. Leaves are "groups" (each has its own tab strip
 * and one active tab). Interior nodes are "splits" (row = side-by-side,
 * col = stacked) holding exactly two children with relative sizes.
 *
 * The flat `tabs` array in StudioShell stays the single source of tab DATA;
 * groups only reference tab ids. All operations here are pure and return a new
 * tree (structural sharing where nothing changed) so Svelte reactivity is
 * predictable.
 *
 * @typedef {object} GroupNode
 * @property {'group'} type
 * @property {string} id
 * @property {string[]} tabIds
 * @property {string | null} activeTabId
 *
 * @typedef {object} SplitNode
 * @property {'split'} type
 * @property {string} id
 * @property {'row' | 'col'} dir
 * @property {[PaneNode, PaneNode]} children
 * @property {[number, number]} sizes - percentages, sum ≈ 100
 *
 * @typedef {GroupNode | SplitNode} PaneNode
 * @typedef {'center' | 'left' | 'right' | 'top' | 'bottom'} DropEdge
 */

let paneSeq = 0

export function nextGroupId() {
  paneSeq += 1
  return `grp-${paneSeq}`
}

export function nextSplitId() {
  paneSeq += 1
  return `spl-${paneSeq}`
}

/**
 * @param {string[]} [tabIds]
 * @param {string | null} [activeTabId]
 * @returns {GroupNode}
 */
export function makeGroup(tabIds = [], activeTabId = null) {
  const ids = [...tabIds]
  return {
    type: 'group',
    id: nextGroupId(),
    tabIds: ids,
    activeTabId: activeTabId && ids.includes(activeTabId) ? activeTabId : (ids[ids.length - 1] ?? null),
  }
}

/** @param {PaneNode | null} node @returns {GroupNode[]} */
export function allGroups(node, acc = /** @type {GroupNode[]} */ ([])) {
  if (!node) return acc
  if (node.type === 'group') {
    acc.push(node)
    return acc
  }
  allGroups(node.children[0], acc)
  allGroups(node.children[1], acc)
  return acc
}

/** @param {PaneNode | null} node @returns {GroupNode | null} */
export function firstGroup(node) {
  if (!node) return null
  if (node.type === 'group') return node
  return firstGroup(node.children[0])
}

/** @param {PaneNode | null} node @param {string} id @returns {GroupNode | null} */
export function findGroup(node, id) {
  for (const g of allGroups(node)) if (g.id === id) return g
  return null
}

/** @param {PaneNode | null} node @param {string} tabId @returns {GroupNode | null} */
export function groupOfTab(node, tabId) {
  for (const g of allGroups(node)) if (g.tabIds.includes(tabId)) return g
  return null
}

/** @param {PaneNode | null} node @returns {number} */
export function groupCount(node) {
  return allGroups(node).length
}

/** True when the tree is a single group (the "no split" / classic layout). */
export function isSingleGroup(node) {
  return !!node && node.type === 'group'
}

/**
 * Immutably replace every group node via `fn`. Returns the same reference when
 * nothing changed so downstream reactive reads stay stable.
 * @param {PaneNode | null} node
 * @param {(g: GroupNode) => GroupNode} fn
 * @returns {PaneNode | null}
 */
export function mapGroups(node, fn) {
  if (!node) return node
  if (node.type === 'group') return fn(node)
  const a = mapGroups(node.children[0], fn)
  const b = mapGroups(node.children[1], fn)
  if (a === node.children[0] && b === node.children[1]) return node
  return { ...node, children: /** @type {[PaneNode, PaneNode]} */ ([a, b]) }
}

/**
 * Update a single group by id.
 * @param {PaneNode | null} node
 * @param {string} id
 * @param {(g: GroupNode) => GroupNode} updater
 */
export function updateGroup(node, id, updater) {
  return mapGroups(node, (g) => (g.id === id ? updater(g) : g))
}

/**
 * Drop empty groups and collapse splits that end up with a single child.
 * @param {PaneNode | null} node
 * @returns {PaneNode | null}
 */
export function prune(node) {
  if (!node) return null
  if (node.type === 'group') return node.tabIds.length ? node : null
  const a = prune(node.children[0])
  const b = prune(node.children[1])
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  if (a === node.children[0] && b === node.children[1]) return node
  return { ...node, children: /** @type {[PaneNode, PaneNode]} */ ([a, b]) }
}

/**
 * Split `targetGroupId` in the direction implied by `edge`, placing `newGroup`
 * on the appropriate side.
 * @param {PaneNode} root
 * @param {string} targetGroupId
 * @param {DropEdge} edge
 * @param {GroupNode} newGroup
 * @returns {PaneNode}
 */
export function splitGroup(root, targetGroupId, edge, newGroup) {
  const dir = edge === 'left' || edge === 'right' ? 'row' : 'col'
  const before = edge === 'left' || edge === 'top'
  return /** @type {PaneNode} */ (
    mapGroups(root, (g) => {
      if (g.id !== targetGroupId) return g
      const children = /** @type {[PaneNode, PaneNode]} */ (before ? [newGroup, g] : [g, newGroup])
      return { type: 'split', id: nextSplitId(), dir, children, sizes: [50, 50] }
    })
  )
}

/**
 * Set the sizes of the split node with `splitId`.
 * @param {PaneNode | null} root
 * @param {string} splitId
 * @param {[number, number]} sizes
 */
export function setSizes(root, splitId, sizes) {
  /** @param {PaneNode | null} node @returns {PaneNode | null} */
  function rec(node) {
    if (!node || node.type === 'group') return node
    if (node.id === splitId) return { ...node, sizes }
    const a = rec(node.children[0])
    const b = rec(node.children[1])
    if (a === node.children[0] && b === node.children[1]) return node
    return { ...node, children: /** @type {[PaneNode, PaneNode]} */ ([a, b]) }
  }
  return rec(root)
}

/**
 * Remove `tabId` from whichever group holds it, fixing that group's active tab.
 * Does NOT prune empty groups (caller decides).
 * @param {PaneNode | null} root
 * @param {string} tabId
 */
export function removeTab(root, tabId) {
  return mapGroups(root, (g) => {
    if (!g.tabIds.includes(tabId)) return g
    const tabIds = g.tabIds.filter((t) => t !== tabId)
    let activeTabId = g.activeTabId
    if (activeTabId === tabId) {
      const idx = g.tabIds.indexOf(tabId)
      activeTabId = tabIds[Math.min(idx, tabIds.length - 1)] ?? null
    }
    return { ...g, tabIds, activeTabId }
  })
}

/**
 * Add `tabId` to `groupId` (optionally at `index`) and make it active there.
 * @param {PaneNode | null} root
 * @param {string} groupId
 * @param {string} tabId
 * @param {number} [index]
 */
export function addTabToGroup(root, groupId, tabId, index) {
  return updateGroup(root, groupId, (g) => {
    if (g.tabIds.includes(tabId)) return { ...g, activeTabId: tabId }
    const tabIds = [...g.tabIds]
    if (index == null || index < 0 || index > tabIds.length) tabIds.push(tabId)
    else tabIds.splice(index, 0, tabId)
    return { ...g, tabIds, activeTabId: tabId }
  })
}
