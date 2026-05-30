<script>
  import { tick, onDestroy, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Link2 from "@lucide/svelte/icons/link-2";
  import Zap from "@lucide/svelte/icons/zap";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronsDownUp from "@lucide/svelte/icons/chevrons-down-up";
  import Copy from "@lucide/svelte/icons/copy";
  import Pencil from "@lucide/svelte/icons/pencil";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Braces from "@lucide/svelte/icons/braces";
  import CheckSquare from "@lucide/svelte/icons/check-square";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import Table2 from "@lucide/svelte/icons/table-2";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import {
    findForeignKeyForColumn,
    foreignKeyTargetLabel,
  } from "$lib/foreign-key-nav.js";
  import TableLoading from "./TableLoading.svelte";
  import ColumnResizeHandle from "./ColumnResizeHandle.svelte";
  import {
    loadColumnWidths,
    saveColumnWidths,
  } from "$lib/stores/table-column-widths.js";
  import {
    clampColumnWidth,
    defaultColumnWidth,
  } from "$lib/table-column-widths.js";
  import { formatCompactCount } from "$lib/table-list.js";
  import { cn, cx } from "$lib/utils.js";
  import {
    formatJsonValue,
    formatNormalValue,
    rowToRecord,
  } from "$lib/row-inspector.js";
  import {
    getColumnEnumValues,
    isBooleanType,
    isEditableType,
    parseCellInput,
    valueToEditString,
  } from "$lib/cell-value.js";
  import { cellLinkHref, cellUrlType } from "$lib/cell-display.js";
  import UrlPreviewTooltip from "./UrlPreviewTooltip.svelte";
  import MediaLightbox from "./MediaLightbox.svelte";
  import RowExpandViewer from "./RowExpandViewer.svelte";
  import JsonCellLightbox from "./JsonCellLightbox.svelte";
  import CellQuickLook from "./CellQuickLook.svelte";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";

  let {
    columns = [],
    rows = [],
    loading = false,
    primaryKey = [],
    foreignKeys = [],
    saving = false,
    selected = $bindable(new Set()),
    /** @type {number | null} */
    focusedRow = $bindable(null),
    /** @type {number | null} */
    inspectorRow = $bindable(null),
    /** @type {{ rowIdx: number, colIdx: number, draft: string, original: string } | null} */
    editingCell = $bindable(null),
    /**
     * @param {{ rowIdx: number, colIdx: number, value: unknown }} detail
     * @returns {Promise<void>}
     */
    onsave = async () => {},
    /**
     * @param {{ rowIndices: number[] }} detail
     * @returns {Promise<void>}
     */
    ondelete = async () => {},
    /** @param {{ rowIdx: number, colIdx: number }} detail */
    onfollowforeignkey = () => {},
    /** Compact layout for AI chat / nested panels */
    embedded = false,
    showSelection = true,
    showRowExpand = true,
    /** Persist column widths per table, e.g. "public.users" */
    columnWidthsKey = undefined,
    /** Schema + table name used for INSERT statement generation */
    schema = '',
    tableName = '',
    /** Set of column names to hide. Controlled externally (toolbar). */
    hiddenColumns = /** @type {Set<string>} */ (new Set()),
    /**
     * Indexes for this table (from listIndexes, already filtered to the current table).
     * Used to show index/unique badges on column headers.
     * @type {{ name: string, tableName: string, columns: string, indexType: string, isUnique: boolean, isPrimary: boolean }[]}
     */
    indexes = [],
    /** Column names pinned to the left. Bindable so the parent can persist. */
    pinnedColumns = $bindable(/** @type {Set<string>} */ (new Set())),
    /** Active sort. null = unsorted. */
    rowSort = /** @type {{ column: string, direction: 'asc' | 'desc' } | null} */ (null),
    /** Called when user clicks a column header to sort. */
    onsortchange = /** @type {(sort: { column: string, direction: 'asc' | 'desc' } | null) => void} */ (() => {}),
    /** Number of staged (unsaved) cell edits. Bindable so the StatusBar can show Apply/Reset. */
    pendingEditCount = $bindable(0),
    /** Assigned by this component; the parent calls these to flush / discard staged edits. */
    applyEdits = $bindable(/** @type {() => void | Promise<void>} */ (() => {})),
    resetEdits = $bindable(/** @type {() => void} */ (() => {})),
    /** Assigned by this component; the parent (StatusBar) calls these to jump the
     *  table to the top / bottom. */
    scrollToTop = $bindable(/** @type {() => void} */ (() => {})),
    scrollToBottom = $bindable(/** @type {() => void} */ (() => {})),
    /** Called when user picks "Filter by this column" from the column header context menu. */
    onfiltercolumn = /** @type {(colName: string) => void} */ (() => {}),
    /** Called when user picks "Hide column" from the column header context menu. */
    onhidecolumn = /** @type {(colName: string) => void} */ (() => {}),
  } = $props();

  /**
   * Staged cell edits not yet written to the database, keyed by "rowIdx:colIdx".
   * The cell shows the staged value (marked dirty) until the user clicks Apply.
   * @type {Map<string, { rowIdx: number, colIdx: number, value: unknown, original: unknown }>}
   */
  let pendingEdits = $state(new Map());
  /** Cheap gate so per-cell staged-edit lookups are skipped entirely when there
   *  are no unsaved edits (the common case) — avoids a string alloc + Map.get
   *  on every cell of large tables. */
  const hasPendingEdits = $derived(pendingEdits.size > 0);

  /** @type {HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null} */
  let editInput = $state(null);

  /**
   * @typedef {{ rowIdx: number, colIdx: number, draft: string, original: string, columnName: string, dataType: string, nullable: boolean }} QuickLookCell
   * @type {QuickLookCell | null}
   */
  let quickLookCell = $state(null);

  let contextRowIdx = $state(0);
  let contextColIdx = $state(0);
  let contextMenuOpen = $state(false);
  let pendingContextMenu = $state(false);
  /** Block item activation from the right-click pointerup that opened the menu */
  let suppressMenuSelect = $state(false);
  /** Row indices with inline JSON detail open */
  let expandedRows = $state(new Set());
  /** @type {Record<string, number>} */
  let columnWidths = $state({});
  /** @type {string | null} */
  let resizingColName = $state(null);
  let resizeStartWidth = 0;

  // ── Keyboard navigation / undo ────────────────────────────────────────────
  /** Visible-column index of the focused cell (null = no cell focus). */
  let focusedCol = $state(/** @type {number | null} */ (null));
  /** Scrollable container element for programmatic focus + scroll. */
  let tableContainer = $state(/** @type {HTMLDivElement | null} */ (null));
  /** Whether to select-all text when the edit input is focused. */
  let selectOnEditFocus = $state(true);
  /** Raw cell value before the current edit started (for undo tracking). */
  let lastEditOriginalValue = $state(/** @type {unknown} */ (undefined));
  /**
   * Committed edit history for Ctrl+Z.
   * @type {{ rowIdx: number, colIdx: number, oldValue: unknown, newValue: unknown }[]}
   */
  let pastEdits = $state([]);
  /**
   * Undone edits available for Ctrl+Shift+Z / Ctrl+Y.
   * @type {{ rowIdx: number, colIdx: number, oldValue: unknown, newValue: unknown }[]}
   */
  let futureEdits = $state([]);
  /** True while focus is inside this table (container or any child). */
  let isTableFocused = $state(false);

  // ── Column collapse (drag-to-hide) ───────────────────────────────────────
  const COLLAPSED_COL_WIDTH = 12  // px width of the collapsed indicator strip
  const COLLAPSE_ZONE = 40        // drag below this → snap preview + collapse on release
  /** Columns collapsed by dragging the resize handle fully left. */
  let collapsedColumns = $state(/** @type {Set<string>} */ (new Set()))

  // ── Virtual scroll ────────────────────────────────────────────────────────
  // Two competing goals:
  //   • Fast tab switch — mounting all rows up front is slow, so on a fresh
  //     table we mount VIRTUALIZED (only the visible window ≈ a few dozen rows).
  //   • Smooth scroll — native scroll of a fully-rendered table beats windowing,
  //     so a moment after mount we EXPAND to render every row (up to a cap).
  // The expansion runs off the switch's critical path, so switching feels instant
  // and scrolling is smooth once the page settles. Very large pages stay
  // windowed forever to keep the DOM/memory bounded.
  const VIRTUAL_THRESHOLD = 100   // above this, mount windowed for a fast switch
  const FULL_RENDER_MAX = 2000    // expand to a full render up to this many rows
  // Defer the full render until just after the tab switch settles.
  let _deferFullRender = $state(true)
  // Row height: gutter-inner has min-height 1.75rem; at --app-font-size:14px that is
  // 1.75 × 14 = 24.5px → 25px rendered. Add 1px for subpixel headroom → 26.
  const ROW_HEIGHT = 26
  // 15 rows = ~390px overscan buffer on each side — enough for fast touchpad/wheel
  // scrolling without creating too many extra DOM nodes per replenishment cycle.
  const OVERSCAN = 15
  let _scrollTop = $state(0)
  // Start high so the first virtual render covers any reasonable screen height
  // before the ResizeObserver fires with the real value.
  let _viewportHeight = $state(1200)

  // ── URL preview / lightbox ────────────────────────────────────────────────
  /** @type {string | null} */
  let previewUrl = $state(null);
  /** @type {'image' | 'pdf' | 'link' | null} */
  let previewType = $state(null);
  /** @type {DOMRect | null} */
  let previewAnchorRect = $state(null);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let previewShowTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let previewHideTimer = null;

  /** @type {string | null} */
  let lightboxUrl = $state(null);

  /** @type {{ value: unknown, colName: string } | null} */
  let jsonLightbox = $state(null)

  /** @param {unknown} value @param {string} colName @param {MouseEvent} e */
  function openJsonLightbox(value, colName, e) {
    e.stopPropagation()
    jsonLightbox = { value, colName }
  }

  /** @type {'image' | 'pdf'} */
  let lightboxType = $state("image");

  /** @param {string} href @param {'image'|'pdf'|'link'} type @param {DOMRect} rect */
  function showUrlPreview(href, type, rect) {
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
    if (previewShowTimer) clearTimeout(previewShowTimer);
    if (type === "link") return;
    previewShowTimer = setTimeout(() => {
      previewUrl = href;
      previewType = type;
      previewAnchorRect = rect;
      previewShowTimer = null;
    }, 350);
  }

  function scheduleHidePreview() {
    if (previewShowTimer) {
      clearTimeout(previewShowTimer);
      previewShowTimer = null;
    }
    if (previewHideTimer) return;
    previewHideTimer = setTimeout(() => {
      previewUrl = null;
      previewHideTimer = null;
    }, 250);
  }

  function cancelHidePreview() {
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
  }

  async function openExternal(/** @type {string} */ url) {
    try {
      const isTauri =
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        const { openUrl: open } = await import("@tauri-apps/plugin-opener");
        await open(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      const { toast } = await import("svelte-sonner");
      toast.error(`Could not open URL: ${String(err)}`);
    }
  }

  function canEditColumn(colIdx) {
    const col = columns[colIdx];
    if (!col || !primaryKey.length) return false;
    return isEditableType(col.dataType ?? col.data_type ?? "");
  }

  const menuColName = $derived(columns[contextColIdx]?.name ?? "cell");
  const menuForeignKey = $derived(
    menuColName ? findForeignKeyForColumn(foreignKeys, menuColName) : null,
  );
  const menuForeignKeyLabel = $derived(
    menuForeignKey ? foreignKeyTargetLabel(menuForeignKey) : "",
  );
  const menuEditable = $derived(canEditColumn(contextColIdx));
  const menuColPinned = $derived(pinnedColumns.has(menuColName));
  const menuColCollapsed = $derived(collapsedColumns.has(menuColName));
  const menuCellNull = $derived(
    rows[contextRowIdx]?.[contextColIdx] === null ||
      rows[contextRowIdx]?.[contextColIdx] === undefined,
  );

  const CELL_DISPLAY_LIMIT = 400

  // Cache stringified object/array cells — row values are stable references
  // until a refetch, so we stringify each once instead of on every re-render
  // (focus/selection/scroll all re-evaluate visible cells).
  /** @type {WeakMap<object, string>} */
  const _formatCache = new WeakMap();
  function formatCell(value) {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") {
      const cached = _formatCache.get(value);
      if (cached !== undefined) return cached;
      const s = JSON.stringify(value);
      _formatCache.set(value, s);
      return s;
    }
    return String(value);
  }

  /** Truncated version for DOM rendering — keeps long values out of the render tree */
  function displayCell(value) {
    const s = formatCell(value);
    return s.length > CELL_DISPLAY_LIMIT ? s.slice(0, CELL_DISPLAY_LIMIT) + "…" : s;
  }

  function focusRow(rowIdx) {
    if (editingCell) return;
    focusedRow = rowIdx;
    if (focusedCol === null) focusedCol = 0;
  }

  /** Maps a navigable-column index → actual column index in `columns`. Skips collapsed strips. */
  function visToActualColIdx(visColIdx) {
    const colName = navigableColumns[visColIdx]?.name;
    return colName ? columns.findIndex((c) => c.name === colName) : -1;
  }

  /** Maps an actual column index → navigable-column index (-1 if hidden/collapsed). */
  function actualToVisColIdx(actualColIdx) {
    const colName = columns[actualColIdx]?.name;
    return colName ? navigableColumns.findIndex((c) => c.name === colName) : -1;
  }

  /** @param {number} rowIdx */
  function scrollRowIntoView(rowIdx) {
    tick().then(() => {
      const el = tableContainer?.querySelector(`[data-row-idx="${rowIdx}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
      } else if (useVirtual && tableContainer) {
        const estimatedTop = rowIdx * ROW_HEIGHT
        const ch = tableContainer.clientHeight
        const st = tableContainer.scrollTop
        if (estimatedTop < st) {
          tableContainer.scrollTop = Math.max(0, estimatedTop - OVERSCAN * ROW_HEIGHT)
        } else if (estimatedTop + ROW_HEIGHT > st + ch) {
          tableContainer.scrollTop = estimatedTop - ch + ROW_HEIGHT + OVERSCAN * ROW_HEIGHT
        }
      }
    })
  }

  const fkByColumn = $derived(
    Object.fromEntries(columns.map((c) => [c.name, findForeignKeyForColumn(foreignKeys, c.name)])),
  );

  /** @param {number} rowIdx @param {number} colIdx */
  function foreignKeyForCell(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col) return null;
    return fkByColumn[col.name] ?? null;
  }

  /**
   * @param {number} rowIdx
   * @param {number} colIdx
   * @param {MouseEvent} [e]
   * @param {{ requireModifier?: boolean }} [opts]
   */
  function tryFollowForeignKey(rowIdx, colIdx, e, opts = {}) {
    if (!foreignKeyForCell(rowIdx, colIdx)) return false;
    const cellValue = rows[rowIdx]?.[colIdx];
    if (cellValue === null || cellValue === undefined) return false;
    if (opts.requireModifier && e && !(e.metaKey || e.ctrlKey || e.altKey))
      return false;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onfollowforeignkey({ rowIdx, colIdx });
    return true;
  }

  function openInInspector(rowIdx) {
    focusRow(rowIdx);
    inspectorRow = rowIdx;
  }

  /** @param {() => void} action */
  function runMenuAction(action) {
    if (suppressMenuSelect) return;
    action();
  }

  function armMenuSelectGuard() {
    suppressMenuSelect = true;
    const release = () => {
      window.removeEventListener("pointerdown", release);
      window.removeEventListener("pointercancel", release);
      suppressMenuSelect = false;
    };
    // pointerdown fires before click/pointerup, so the guard is always cleared
    // before onSelect fires. On Linux, contextmenu fires on right-click pointerup,
    // meaning armMenuSelectGuard runs after that pointerup has already passed —
    // listening for pointerup would catch the menu item's own pointerup and the
    // setTimeout(0) would still be pending when onSelect fired, blocking all items.
    window.addEventListener("pointerdown", release);
    window.addEventListener("pointercancel", release);
  }

  /**
   * @param {number} rowIdx
   * @param {number} colIdx
   * @param {string} [initialChar] When set, the cell starts with this character
   *   instead of the existing value (type-to-edit behavior).
   */
  function startEdit(rowIdx, colIdx, initialChar) {
    const col = columns[colIdx];
    if (!col) return;

    if (!primaryKey.length) {
      toast.error("Cannot edit", {
        description: "This table has no primary key.",
      });
      return;
    }

    const dataType = col.dataType ?? col.data_type ?? "";
    if (!isEditableType(dataType)) {
      toast.error("Cannot edit column", {
        description: `${col.name} (${dataType}) is not editable.`,
      });
      return;
    }

    focusedRow = rowIdx;
    const startValue = effectiveCellValue(rowIdx, colIdx);
    lastEditOriginalValue = startValue;
    selectOnEditFocus = initialChar === undefined;
    const original = valueToEditString(startValue);
    editingCell = {
      rowIdx,
      colIdx,
      draft: initialChar !== undefined ? initialChar : original,
      original,
    };
  }

  function cancelEdit() {
    if (!editingCell) return;
    editingCell = null;
    tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  /** @param {number} rowIdx @param {number} colIdx */
  function openQuickLook(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col) return;
    const dataType = col.dataType ?? col.data_type ?? "";
    if (!isEditableType(dataType)) return;
    // close any inline edit first
    if (editingCell) cancelEdit();
    const startValue = effectiveCellValue(rowIdx, colIdx);
    const original = valueToEditString(startValue);
    quickLookCell = {
      rowIdx,
      colIdx,
      draft: original,
      original,
      columnName: col.name,
      dataType,
      nullable: col.nullable ?? true,
    };
  }

  function cancelQuickLook() {
    quickLookCell = null;
    tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  async function commitQuickLook() {
    if (!quickLookCell || saving) return;
    const { rowIdx, colIdx, draft } = quickLookCell;
    const col = columns[colIdx];
    if (!col) return;
    if (draft === quickLookCell.original) {
      quickLookCell = null;
      tick().then(() => tableContainer?.focus({ preventScroll: true }));
      return;
    }
    const parsed = parseCellInput(draft, col.dataType ?? col.data_type ?? "text", getColumnEnumValues(col));
    if (!parsed.ok) {
      toast.error("Invalid value", { description: parsed.message });
      return;
    }
    const prevValue = effectiveCellValue(rowIdx, colIdx);
    stageEdit(rowIdx, colIdx, parsed.value);
    pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: prevValue, newValue: parsed.value }];
    futureEdits = [];
    quickLookCell = null;
    tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  /** Stable map key for a staged edit. */
  const editKey = (/** @type {number} */ rowIdx, /** @type {number} */ colIdx) => `${rowIdx}:${colIdx}`;

  /** The value a cell currently shows: the staged edit if any, else the DB value. */
  function effectiveCellValue(/** @type {number} */ rowIdx, /** @type {number} */ colIdx) {
    const staged = pendingEdits.get(editKey(rowIdx, colIdx));
    return staged ? staged.value : rows[rowIdx]?.[colIdx];
  }

  /**
   * Stage (or unstage) a cell edit locally — does not touch the DB.
   * If the value matches the row's persisted value, the staged edit is dropped.
   * @param {number} rowIdx @param {number} colIdx @param {unknown} value
   */
  function stageEdit(rowIdx, colIdx, value) {
    const next = new Map(pendingEdits);
    const key = editKey(rowIdx, colIdx);
    const dbValue = rows[rowIdx]?.[colIdx];
    if (valuesEqual(value, dbValue)) {
      next.delete(key);
    } else {
      next.set(key, { rowIdx, colIdx, value, original: dbValue });
    }
    pendingEdits = next;
  }

  /** Loose equality for cell values (handles object/array via JSON). */
  function valuesEqual(/** @type {unknown} */ a, /** @type {unknown} */ b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a === "object" || typeof b === "object") {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
    }
    return false;
  }

  /** @param {'down' | 'right' | 'left' | null} afterAction */
  async function commitEditWithAction(afterAction) {
    if (!editingCell || saving) return;

    const { rowIdx, colIdx, draft } = editingCell;
    const col = columns[colIdx];
    if (!col) return;

    if (draft === editingCell.original) {
      editingCell = null;
      if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction);
      else tick().then(() => tableContainer?.focus({ preventScroll: true }));
      return;
    }

    const parsed = parseCellInput(
      draft,
      col.dataType ?? col.data_type ?? "text",
      getColumnEnumValues(col),
    );
    if (!parsed.ok) {
      toast.error("Invalid value", { description: parsed.message });
      return;
    }

    // Stage the change instead of writing immediately — the user applies all
    // pending edits at once from the StatusBar (or discards them with Reset).
    const prevValue = effectiveCellValue(rowIdx, colIdx);
    stageEdit(rowIdx, colIdx, parsed.value);
    pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: prevValue, newValue: parsed.value }];
    futureEdits = [];
    editingCell = null;
    if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction);
    else tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  async function commitEdit() {
    return commitEditWithAction(null);
  }

  /**
   * Commit the current edit straight to the database, skipping the staged
   * Apply/Reset queue (Ctrl/Cmd+Shift+Enter).
   * @param {'down' | 'right' | 'left' | null} afterAction
   */
  async function commitEditImmediate(afterAction) {
    if (!editingCell || saving) return;
    const { rowIdx, colIdx, draft } = editingCell;
    const col = columns[colIdx];
    if (!col) return;

    if (draft === editingCell.original) {
      editingCell = null;
      if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction);
      else tick().then(() => tableContainer?.focus({ preventScroll: true }));
      return;
    }

    const parsed = parseCellInput(
      draft,
      col.dataType ?? col.data_type ?? "text",
      getColumnEnumValues(col),
    );
    if (!parsed.ok) {
      toast.error("Invalid value", { description: parsed.message });
      return;
    }

    try {
      await onsave({ rowIdx, colIdx, value: parsed.value });
      // Drop any staged edit for this cell — it's now persisted.
      const key = editKey(rowIdx, colIdx);
      if (pendingEdits.has(key)) {
        const next = new Map(pendingEdits);
        next.delete(key);
        pendingEdits = next;
      }
      editingCell = null;
      toast.success("Saved", { description: `${col.name} updated` });
      if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction);
      else tick().then(() => tableContainer?.focus({ preventScroll: true }));
    } catch (err) {
      toast.error("Save failed", { description: String(err) });
    }
  }

  /** Flush all staged edits to the database. */
  async function applyPendingEdits() {
    if (pendingEdits.size === 0 || saving) return;
    const entries = [...pendingEdits.values()];
    /** @type {typeof entries} */
    const failed = [];
    let okCount = 0;
    for (const edit of entries) {
      try {
        await onsave({ rowIdx: edit.rowIdx, colIdx: edit.colIdx, value: edit.value });
        okCount++;
      } catch (err) {
        failed.push(edit);
        toast.error("Save failed", { description: String(err) });
      }
    }
    // Keep only the edits that failed so the user can retry / reset them.
    const next = new Map();
    for (const edit of failed) next.set(editKey(edit.rowIdx, edit.colIdx), edit);
    pendingEdits = next;
    pastEdits = [];
    futureEdits = [];
    if (okCount > 0) {
      toast.success("Changes applied", { description: `${okCount} cell${okCount === 1 ? "" : "s"} updated` });
    }
  }

  /** Discard all staged edits. */
  function resetPendingEdits() {
    if (pendingEdits.size === 0) return;
    pendingEdits = new Map();
    pastEdits = [];
    futureEdits = [];
  }

  // Surface staged-edit state to the parent (→ StatusBar Apply/Reset buttons).
  $effect(() => {
    applyEdits = applyPendingEdits;
    resetEdits = resetPendingEdits;
  });
  $effect(() => { pendingEditCount = pendingEdits.size; });

  // Surface scroll-to-top / scroll-to-bottom to the parent (→ StatusBar buttons).
  $effect(() => {
    scrollToTop = () => tableContainer?.scrollTo({ top: 0 });
    scrollToBottom = () => { if (tableContainer) tableContainer.scrollTo({ top: tableContainer.scrollHeight }); };
  });


  async function copyCellValue(rowIdx, colIdx) {
    const value = rows[rowIdx]?.[colIdx];
    try {
      await navigator.clipboard.writeText(formatNormalValue(value));
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function copyRowJson(rowIdx) {
    const record = rowToRecord(columns, rows[rowIdx] ?? []);
    try {
      await navigator.clipboard.writeText(formatJsonValue(record));
      toast.success("Copied row as JSON");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  // ── Copy row as … ──────────────────────────────────────────────────────────

  /** Indices to copy: all selected rows if contextRow is in selection, else just contextRow. */
  function copyTargetIndices(rowIdx) {
    return selected.size > 1 && selected.has(rowIdx)
      ? [...selected].sort((a, b) => a - b)
      : [rowIdx];
  }

  /** Escape a cell value for CSV (RFC 4180). */
  function csvCell(value) {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Escape a cell value for SQL INSERT. */
  function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      const s = JSON.stringify(value).replace(/'/g, "''");
      return `'${s}'`;
    }
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  /** Markdown-safe cell text. */
  function mdCell(value) {
    if (value === null || value === undefined) return 'NULL';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  async function copyAs(rowIdx, format) {
    const indices = copyTargetIndices(rowIdx);
    const colNames = columns.map((c) => c.name);
    const dataRows = indices.map((i) => rows[i] ?? []);
    let text = '';
    const label = indices.length > 1 ? `${indices.length} rows` : '1 row';

    if (format === 'csv') {
      const header = colNames.map(csvCell).join(',');
      const body = dataRows.map((r) => r.map(csvCell).join(',')).join('\n');
      text = header + '\n' + body;
    } else if (format === 'json') {
      const records = dataRows.map((r) => rowToRecord(columns, r));
      text = formatJsonValue(indices.length === 1 ? records[0] : records);
    } else if (format === 'plain') {
      text = dataRows
        .map((r) =>
          colNames.map((name, i) => {
            const v = r[i];
            const s = v === null || v === undefined ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v);
            return `${name}: ${s}`;
          }).join('\n'),
        )
        .join('\n\n');
    } else if (format === 'markdown') {
      const sep = colNames.map(() => '---').join(' | ');
      const header = colNames.map(mdCell).join(' | ');
      const body = dataRows.map((r) => r.map(mdCell).join(' | ')).join('\n');
      text = `| ${header} |\n| ${sep} |\n${dataRows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n')}`;
    } else if (format === 'insert') {
      const tbl = schema ? `"${schema}"."${tableName || 'table'}"` : `"${tableName || 'table'}"`;
      const cols = colNames.map((c) => `"${c}"`).join(', ');
      text = dataRows
        .map((r) => `INSERT INTO ${tbl} (${cols}) VALUES (${r.map(sqlLiteral).join(', ')});`)
        .join('\n');
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label} as ${format.toUpperCase()}`);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  function setCellNull(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col || !canEditColumn(colIdx)) return;
    if (effectiveCellValue(rowIdx, colIdx) === null) {
      toast.message("Already NULL");
      return;
    }
    const prevValue = effectiveCellValue(rowIdx, colIdx);
    stageEdit(rowIdx, colIdx, null);
    pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: prevValue, newValue: null }];
    futureEdits = [];
  }

  /** @param {number} rowIdx */
  function rowIndicesToDelete(rowIdx) {
    if (selected.size > 0 && selected.has(rowIdx)) {
      return [...selected].sort((a, b) => a - b);
    }
    return [rowIdx];
  }

  /** @param {number} rowIdx */
  async function deleteRow(rowIdx) {
    if (!primaryKey.length) {
      toast.error("Cannot delete", {
        description: "This table has no primary key.",
      });
      return;
    }
    const rowIndices = rowIndicesToDelete(rowIdx);
    try {
      await ondelete({ rowIndices });
      const n = rowIndices.length;
      toast.success(
        n === 1 ? "Row deleted" : `${formatCompactCount(n)} rows deleted`,
      );
    } catch (err) {
      toast.error("Delete failed", { description: String(err) });
    }
  }

  /** @param {number} rowIdx @param {number} colIdx @param {'down'|'right'|'left'} action */
  function navigateAfterEdit(rowIdx, colIdx, action) {
    const visColIdx = actualToVisColIdx(colIdx);
    const visLen = navigableColumns.length;
    const rowLen = rows.length;
    if (action === "down") {
      const next = Math.min(rowIdx + 1, rowLen - 1);
      focusedRow = next;
      focusedCol = visColIdx >= 0 ? visColIdx : 0;
      scrollRowIntoView(next);
    } else if (action === "right") {
      if (visColIdx < visLen - 1) { focusedRow = rowIdx; focusedCol = visColIdx + 1; }
      else if (rowIdx < rowLen - 1) { focusedRow = rowIdx + 1; focusedCol = 0; scrollRowIntoView(rowIdx + 1); }
    } else {
      if (visColIdx > 0) { focusedRow = rowIdx; focusedCol = visColIdx - 1; }
      else if (rowIdx > 0) { focusedRow = rowIdx - 1; focusedCol = visLen - 1; scrollRowIntoView(rowIdx - 1); }
    }
    tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  function undoEdit() {
    if (!pastEdits.length) return;
    const last = pastEdits[pastEdits.length - 1];
    pastEdits = pastEdits.slice(0, -1);
    futureEdits = [last, ...futureEdits];
    // Undo restages the prior value (still unsaved — Apply persists it).
    stageEdit(last.rowIdx, last.colIdx, last.oldValue);
    focusedRow = last.rowIdx;
    const vi = actualToVisColIdx(last.colIdx);
    focusedCol = vi >= 0 ? vi : 0;
    scrollRowIntoView(last.rowIdx);
    tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  function redoEdit() {
    if (!futureEdits.length) return;
    const next = futureEdits[0];
    futureEdits = futureEdits.slice(1);
    pastEdits = [...pastEdits, next];
    stageEdit(next.rowIdx, next.colIdx, next.newValue);
    focusedRow = next.rowIdx;
    const vi = actualToVisColIdx(next.colIdx);
    focusedCol = vi >= 0 ? vi : 0;
    scrollRowIntoView(next.rowIdx);
    tick().then(() => tableContainer?.focus({ preventScroll: true }));
  }

  $effect(() => {
    if (!editingCell) return;
    void tick().then(() => {
      const el = editInput;
      if (!el) return;
      el.focus();
      if (el instanceof HTMLInputElement) {
        if (selectOnEditFocus) {
          el.select();
        } else {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }
    });
  });

  /** @param {KeyboardEvent} e */
  function handleEditKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
      return;
    }

    // Ctrl+Shift+Backspace: clear entire input
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Backspace") {
      e.preventDefault();
      e.stopPropagation();
      if (editingCell) editingCell.draft = "";
      return;
    }

    // Ctrl+Backspace: delete previous word (WebKit on Linux doesn't do this natively)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "Backspace") {
      const el = editInput;
      if (!(el instanceof HTMLInputElement) || !editingCell) return;
      e.preventDefault();
      e.stopPropagation();
      const val = el.value;
      const pos = el.selectionStart ?? 0;
      const selEnd = el.selectionEnd ?? 0;
      if (pos !== selEnd) {
        const lo = Math.min(pos, selEnd);
        const hi = Math.max(pos, selEnd);
        editingCell.draft = val.slice(0, lo) + val.slice(hi);
        tick().then(() => { if (editInput instanceof HTMLInputElement) editInput.setSelectionRange(lo, lo); });
      } else {
        let start = pos;
        while (start > 0 && /\s/.test(val[start - 1])) start--;
        while (start > 0 && !/\s/.test(val[start - 1])) start--;
        editingCell.draft = val.slice(0, start) + val.slice(pos);
        tick().then(() => { if (editInput instanceof HTMLInputElement) editInput.setSelectionRange(start, start); });
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      void commitEditWithAction(e.shiftKey ? "left" : "right");
      return;
    }
    // Ctrl/Cmd+Shift+Enter saves this cell straight to the database, bypassing
    // the staged Apply/Reset queue.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void commitEditImmediate("down");
      return;
    }
    // Enter (or Ctrl/Cmd+Enter) confirms the edit into the staged queue and
    // moves to the next row.
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      void commitEditWithAction("down");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void commitEditWithAction(null);
    }
  }

  function toggleAll(checked) {
    selected = checked ? new Set(rows.map((_, i) => i)) : new Set();
    lastSelectAnchor = null;
  }

  function toggleRow(idx) {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    selected = next;
  }

  /** Last row index clicked without Shift — the anchor for range selection. */
  let lastSelectAnchor = $state(/** @type {number | null} */ (null));

  /**
   * @param {number} idx
   * @param {boolean} shiftKey
   */
  function handleRowSelect(idx, shiftKey) {
    if (shiftKey && lastSelectAnchor !== null) {
      const lo = Math.min(lastSelectAnchor, idx);
      const hi = Math.max(lastSelectAnchor, idx);
      const next = new Set(selected);
      for (let i = lo; i <= hi; i++) next.add(i);
      selected = next;
    } else {
      toggleRow(idx);
      lastSelectAnchor = idx;
    }
  }

  /** @param {number} rowIdx */
  function isRowExpanded(rowIdx) {
    return expandedRows.has(rowIdx);
  }

  /** @param {number} rowIdx */
  function toggleRowExpand(rowIdx) {
    const next = new Set(expandedRows);
    if (next.has(rowIdx)) next.delete(rowIdx);
    else next.add(rowIdx);
    expandedRows = next;
  }

  /** Collapse every expanded JSON row at once. */
  function collapseAllRows() {
    if (expandedRows.size === 0) return;
    expandedRows = new Set();
  }

  const ROW_EXPAND_COL_WIDTH = 32;
  /** Fits 16px checkbox with equal inset; no extra horizontal padding in cells */
  const ROW_SELECT_COL_WIDTH = 32;
  const visibleColumns = $derived(
    columns.filter((c) => !hiddenColumns.has(c.name)),
  );
  // +1 for the trailing auto-width spacer column (keeps real columns stable).
  const dataColSpan = $derived(visibleColumns.length + 1);
  const totalColSpan = $derived(
    (showRowExpand ? 1 : 0) + (showSelection ? 1 : 0) + visibleColumns.length + 1,
  )
  /** Columns visible to the keyboard — excludes collapsed strips. */
  const navigableColumns = $derived(visibleColumns.filter((c) => !collapsedColumns.has(c.name)))
  /** Map of pinned column name → sticky left offset in px. Gutters are not
   *  sticky, so pinned columns stick from the left edge (0). */
  const pinnedOffsets = $derived.by(() => {
    const map = new Map()
    let left = 0
    for (const col of visibleColumns) {
      if (!pinnedColumns.has(col.name)) continue
      map.set(col.name, left)
      left += widthForColumn(col.name, col.dataType ?? col.data_type ?? '')
    }
    return map
  })
  // Windowed when: not embedded, big enough to matter, AND either we're still
  // deferring the full render (just switched in) or the page is too big to ever
  // fully render. Otherwise render every row for native-smooth scroll.
  const useVirtual = $derived(
    !embedded &&
    rows.length > VIRTUAL_THRESHOLD &&
    (_deferFullRender || rows.length > FULL_RENDER_MAX)
  )

  // On a fresh table / new page, mount windowed (fast switch) then expand to a
  // full render shortly after, so scrolling is smooth. Keyed on table identity +
  // row count so it does NOT re-trigger on in-place cell edits (which keep both).
  $effect(() => {
    void columnWidthsKey
    void rows.length
    _deferFullRender = true
    const id = setTimeout(() => { _deferFullRender = false }, 200)
    return () => clearTimeout(id)
  })
  // Stable key that changes only when column names change — prevents the
  // column-widths $effect from re-running on every row fetch (same columns, new array ref).
  const _columnNamesKey = $derived(columns.map((c) => c.name).join('\x00'))

  // O(1) min/max of expandedRows — recomputed only when the set changes,
  // not on every scroll tick (which was the O(n) per-scroll culprit).
  const _expandedMin = $derived(expandedRows.size ? Math.min(...expandedRows) : Infinity)
  const _expandedMax = $derived(expandedRows.size ? Math.max(...expandedRows) : -Infinity)

  const virtualStart = $derived.by(() => {
    if (!useVirtual) return 0
    let start = Math.max(0, Math.floor(_scrollTop / ROW_HEIGHT) - OVERSCAN)
    // Only the active edit input and expanded (tall) rows must stay mounted when
    // off-screen. A focused (non-editing) row is NOT extended into the window —
    // that would render everything between focus and viewport and lock up large
    // tables; the highlight only matters on-screen and scrollRowIntoView() covers
    // keyboard nav to off-screen rows.
    if (_expandedMin < start) start = Math.max(0, _expandedMin)
    if (editingCell && editingCell.rowIdx < start) start = Math.max(0, editingCell.rowIdx)
    return start
  })
  const virtualEnd = $derived.by(() => {
    if (!useVirtual) return rows.length - 1
    let end = Math.min(rows.length - 1, Math.ceil((_scrollTop + _viewportHeight) / ROW_HEIGHT) + OVERSCAN)
    if (_expandedMax > end) end = Math.min(rows.length - 1, _expandedMax)
    if (editingCell && editingCell.rowIdx > end) end = Math.min(rows.length - 1, editingCell.rowIdx)
    return end
  })
  const virtualTopPad = $derived(virtualStart * ROW_HEIGHT)
  const virtualBottomPad = $derived((rows.length - 1 - virtualEnd) * ROW_HEIGHT)

  // Iterate ABSOLUTE row indices (not a sliced array + loop index). Keyed by the
  // index itself, a reused row keeps a constant `idx` across scroll shifts, so
  // its block does NOT re-run — only the row entering/leaving the window mounts
  // or unmounts. (With a sliced array the loop index shifts for every row each
  // step, forcing all visible rows — and all their cells — to re-render.)
  const visibleRowIndexes = $derived.by(() => {
    if (!useVirtual) return rows.map((_, i) => i)
    /** @type {number[]} */
    const out = []
    for (let i = virtualStart; i <= virtualEnd; i++) out.push(i)
    return out
  })

  const allSelected = $derived(
    rows.length > 0 && selected.size === rows.length,
  );
  const someSelected = $derived(
    selected.size > 0 && selected.size < rows.length,
  );
  const hasPrimaryKey = $derived(primaryKey.length > 0);

  /**
   * Per-column display metadata: pk, fk, indexed, unique, nullable.
   * Keyed by column name.
   * @type {Map<string, { pk: boolean, fk: boolean, indexed: boolean, unique: boolean, nullable: boolean }>}
   */
  // Pre-build a column→indexes lookup once so colMeta is O(1) per column
  // instead of O(columns × indexes) on every schema load.
  const _indexesByCol = $derived.by(() => {
    /** @type {Map<string, typeof indexes>} */
    const m = new Map()
    for (const idx of indexes) {
      for (const col of idx.columns.split(',').map((s) => s.trim())) {
        const list = m.get(col) ?? []
        list.push(idx)
        m.set(col, list)
      }
    }
    return m
  })

  const _pkSet = $derived(new Set(primaryKey))
  const _fkCols = $derived(new Set(foreignKeys.flatMap((fk) => fk.columns)))

  const colMeta = $derived.by(() => {
    /** @type {Map<string, { pk: boolean, fk: boolean, indexed: boolean, unique: boolean, nullable: boolean }>} */
    const map = new Map()
    for (const col of columns) {
      const colIndexes = _indexesByCol.get(col.name) ?? []
      map.set(col.name, {
        pk: _pkSet.has(col.name),
        fk: _fkCols.has(col.name),
        unique: colIndexes.some((idx) => idx.isUnique && !idx.isPrimary),
        indexed: colIndexes.some((idx) => !idx.isPrimary && !idx.isUnique),
        nullable: col.nullable !== false,
      })
    }
    return map
  })

  /** Build FK tooltip text for a column. */
  function fkTooltip(colName) {
    const fk = findForeignKeyForColumn(foreignKeys, colName)
    if (!fk) return 'Foreign key'
    const label = foreignKeyTargetLabel(fk)
    return label ? `Foreign key → ${label}` : 'Foreign key'
  }

  /** @param {number} idx */
  function rowClass(idx) {
    const isFocused = focusedRow === idx;
    const isSelected = selected.has(idx);
    const isExpanded = isRowExpanded(idx);
    // cx (no tailwind-merge): these classes never conflict and this runs per row.
    return cx(
      "group/row outline-none hover:bg-accent/25",
      isExpanded && "[&>td]:border-b-0",
      isSelected && "bg-accent/20",
      isFocused && !isSelected && "bg-accent/15",
      isFocused && isSelected && "ring-1 ring-ring/60 ring-inset",
    );
  }

  /** @param {string} name @param {string} dataType */
  function widthForColumn(name, dataType) {
    if (collapsedColumns.has(name)) return COLLAPSED_COL_WIDTH
    return columnWidths[name] ?? defaultColumnWidth(dataType);
  }

  $effect(() => {
    const key = columnWidthsKey
    _columnNamesKey  // re-run when column names change, but not on row fetches
    const cols = untrack(() => columns)
    const stored = key ? loadColumnWidths(key) : {}
    /** @type {Record<string, number>} */
    const next = {}
    for (const col of cols) {
      const dt = col.dataType ?? col.data_type ?? ""
      next[col.name] = clampColumnWidth(stored[col.name] ?? defaultColumnWidth(dt))
    }
    columnWidths = next
  })

  /** @param {string} colName */
  function startColumnResize(colName) {
    resizingColName = colName;
    resizeStartWidth = columnWidths[colName] ?? defaultColumnWidth("");
  }

  // Batch column resize updates to animation frames — pointermove can fire at
  // 120Hz+, but we only need to update the DOM at 60fps.
  let _resizeRafId = 0;
  let _pendingResizeWidth = 0;

  /** @param {number} dx */
  function applyColumnResize(dx) {
    if (!resizingColName) return;
    const raw = resizeStartWidth + dx
    // Allow dragging into the collapse zone — shows snap-preview at strip width
    _pendingResizeWidth = raw <= COLLAPSE_ZONE ? COLLAPSED_COL_WIDTH : clampColumnWidth(raw)
    if (_resizeRafId) return;
    _resizeRafId = requestAnimationFrame(() => {
      _resizeRafId = 0;
      if (!resizingColName) return;
      columnWidths = { ...columnWidths, [resizingColName]: _pendingResizeWidth };
    });
  }

  function endColumnResize() {
    if (_resizeRafId) {
      cancelAnimationFrame(_resizeRafId);
      _resizeRafId = 0;
      if (resizingColName) {
        columnWidths = { ...columnWidths, [resizingColName]: _pendingResizeWidth };
      }
    }
    if (resizingColName) {
      if ((columnWidths[resizingColName] ?? 0) <= COLLAPSE_ZONE) {
        // Snap to collapsed — restore columnWidths to the pre-drag value so
        // restoring the column brings it back at a sensible width.
        const col = columns.find((c) => c.name === resizingColName)
        const dt = col?.dataType ?? col?.data_type ?? ''
        columnWidths = { ...columnWidths, [resizingColName]: clampColumnWidth(defaultColumnWidth(dt)) }
        collapsedColumns = new Set([...collapsedColumns, resizingColName])
        if (columnWidthsKey) saveColumnWidths(columnWidthsKey, columnWidths)
      } else if (columnWidthsKey) {
        saveColumnWidths(columnWidthsKey, columnWidths);
      }
    }
    resizingColName = null;
  }

  /** Restore a column that was collapsed by dragging. */
  function restoreColumn(colName) {
    const next = new Set(collapsedColumns)
    next.delete(colName)
    collapsedColumns = next
  }

  /** Cycle sort: none → asc → desc → none */
  function handleHeaderSort(colName) {
    // Staged edits are keyed by row index; sorting would reorder rows and
    // desync them. Ask the user to apply or reset first instead of silently
    // dropping their changes.
    if (pendingEdits.size > 0) {
      toast.error("Unsaved changes", {
        description: "Apply or reset your edits before sorting.",
      })
      return
    }
    if (rowSort?.column !== colName) {
      onsortchange({ column: colName, direction: 'desc' })
    } else if (rowSort.direction === 'desc') {
      onsortchange({ column: colName, direction: 'asc' })
    } else {
      onsortchange(null)
    }
  }

  /** Toggle pinning a column to the left. */
  function toggleColumnPin(colName) {
    const next = new Set(pinnedColumns)
    if (next.has(colName)) next.delete(colName)
    else next.add(colName)
    pinnedColumns = next
  }

  /** Sort by a column with an explicit direction, guarding against pending edits. */
  function headerSortDirect(colName, /** @type {'asc' | 'desc'} */ dir) {
    if (pendingEdits.size > 0) {
      toast.error('Unsaved changes', { description: 'Apply or reset your edits before sorting.' })
      return
    }
    onsortchange({ column: colName, direction: dir })
  }

  /** Reset a column's width to its default and un-collapse it if needed. */
  function resetColumnWidth(colName) {
    const col = columns.find((c) => c.name === colName)
    const dt = col?.dataType ?? col?.data_type ?? ''
    columnWidths = { ...columnWidths, [colName]: clampColumnWidth(defaultColumnWidth(dt)) }
    if (collapsedColumns.has(colName)) {
      const next = new Set(collapsedColumns)
      next.delete(colName)
      collapsedColumns = next
    }
    if (columnWidthsKey) saveColumnWidths(columnWidthsKey, columnWidths)
  }

  // Reset focus and undo history when the displayed table changes.
  $effect(() => {
    void columnWidthsKey;
    focusedRow = null;
    focusedCol = null;
    pastEdits = [];
    futureEdits = [];
  });

  // Drop staged edits when the table changes or rows are reordered (sort),
  // since edits are keyed by row index — applying them afterwards could target
  // the wrong rows.
  $effect(() => {
    void columnWidthsKey;
    void (rowSort ? `${rowSort.column}:${rowSort.direction}` : "");
    untrack(() => { if (pendingEdits.size) pendingEdits = new Map(); });
  });

  // Document-level capture so undo/redo fires even during the brief window between
  // editingCell being cleared and the container div regaining focus.
  $effect(() => {
    function onCapture(/** @type {KeyboardEvent} */ e) {
      if (!isTableFocused || editingCell) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        e.shiftKey ? void redoEdit() : void undoEdit();
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        void redoEdit();
      }
    }
    window.addEventListener("keydown", onCapture, true);
    return () => window.removeEventListener("keydown", onCapture, true);
  });

  $effect(() => {
    const container = tableContainer
    if (!container || !useVirtual) return
    _viewportHeight = container.clientHeight
    _scrollTop = container.scrollTop

    // Update synchronously — no RAF delay so the virtual window always matches
    // the scroll position before the browser paints the next frame.
    // Synchronous update — keeps the virtual window exactly matched to the
    // scroll position before paint (rAF coalescing was measurably worse here).
    const onScroll = () => {
      const st = container.scrollTop
      if (st !== _scrollTop) _scrollTop = st
    }

    // Resize is rare; one RAF is fine here to avoid hammering during window drag.
    let roRafId = 0
    const ro = new ResizeObserver(() => {
      if (roRafId) return
      roRafId = requestAnimationFrame(() => { roRafId = 0; _viewportHeight = container.clientHeight })
    })
    container.addEventListener('scroll', onScroll, { passive: true })
    ro.observe(container)
    return () => {
      if (roRafId) cancelAnimationFrame(roRafId)
      container.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  })

  /** @param {KeyboardEvent} e */
  function handleTableKeydown(e) {
    // Ctrl+A: select all rows
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      if (!editingCell) selected = new Set(rows.map((_, i) => i));
      return;
    }
    // Undo / redo — active even while the cell input has focus
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "z" || e.key === "Z")) {
      if (!editingCell) {
        e.preventDefault();
        e.shiftKey ? void redoEdit() : void undoEdit();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "y" || e.key === "Y")) {
      if (!editingCell) { e.preventDefault(); void redoEdit(); return; }
    }
    // Ctrl+Enter when not editing: start edit (same as Enter / F2)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !editingCell) {
      e.preventDefault();
      if (focusedRow !== null && focusedCol !== null) {
        const ai = visToActualColIdx(focusedCol);
        if (ai >= 0) startEdit(focusedRow, ai);
      } else { focusedRow = 0; focusedCol = 0; }
      return;
    }

    // Shift+Space: open Quick Look editor for the focused cell
    if (e.key === " " && e.shiftKey && !e.ctrlKey && !e.metaKey && !editingCell) {
      if (focusedRow !== null && focusedCol !== null) {
        const ai = visToActualColIdx(focusedCol);
        if (ai >= 0 && canEditColumn(ai)) {
          e.preventDefault();
          openQuickLook(focusedRow, ai);
          return;
        }
      }
    }

    if (editingCell) return;

    const visLen = navigableColumns.length;
    const rowLen = rows.length;
    if (!rowLen || !visLen) return;

    const curRow = focusedRow ?? 0;
    const curCol = focusedCol ?? 0;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const nr = Math.min(curRow + 1, rowLen - 1);
        focusedRow = nr; if (focusedCol === null) focusedCol = 0;
        scrollRowIntoView(nr);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const pr = Math.max(curRow - 1, 0);
        focusedRow = pr; if (focusedCol === null) focusedCol = 0;
        scrollRowIntoView(pr);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (focusedRow === null) { focusedRow = 0; focusedCol = 0; break; }
        if (curCol < visLen - 1) { focusedCol = curCol + 1; }
        else if (curRow < rowLen - 1) { focusedRow = curRow + 1; focusedCol = 0; scrollRowIntoView(curRow + 1); }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (focusedRow === null) { focusedRow = 0; focusedCol = 0; break; }
        if (curCol > 0) { focusedCol = curCol - 1; }
        else if (curRow > 0) { focusedRow = curRow - 1; focusedCol = visLen - 1; scrollRowIntoView(curRow - 1); }
        break;
      }
      case "Tab": {
        e.preventDefault();
        if (e.shiftKey) {
          if (focusedRow === null) { focusedRow = 0; focusedCol = 0; break; }
          if (curCol > 0) { focusedCol = curCol - 1; }
          else if (curRow > 0) { focusedRow = curRow - 1; focusedCol = visLen - 1; scrollRowIntoView(curRow - 1); }
        } else {
          if (focusedRow === null) { focusedRow = 0; focusedCol = 0; break; }
          if (curCol < visLen - 1) { focusedCol = curCol + 1; }
          else if (curRow < rowLen - 1) { focusedRow = curRow + 1; focusedCol = 0; scrollRowIntoView(curRow + 1); }
        }
        break;
      }
      case "Enter":
      case "F2": {
        e.preventDefault();
        if (focusedRow !== null && focusedCol !== null) {
          const ai = visToActualColIdx(focusedCol);
          if (ai >= 0) startEdit(focusedRow, ai);
        } else { focusedRow = 0; focusedCol = 0; }
        break;
      }
      case "Escape": {
        e.preventDefault();
        focusedRow = null; focusedCol = null;
        break;
      }
      case "Delete": {
        if (focusedRow !== null && focusedCol !== null) {
          const ai = visToActualColIdx(focusedCol);
          if (ai >= 0 && canEditColumn(ai)) { e.preventDefault(); void setCellNull(focusedRow, ai); }
        }
        break;
      }
      case "Backspace": {
        if (focusedRow !== null && focusedCol !== null) {
          const ai = visToActualColIdx(focusedCol);
          if (ai >= 0 && canEditColumn(ai)) {
            const col = columns[ai];
            const isSelectOrToggle = !!getColumnEnumValues(col) || isBooleanType(col?.dataType ?? col?.data_type ?? "");
            if (!isSelectOrToggle) { e.preventDefault(); startEdit(focusedRow, ai, ""); }
          }
        }
        break;
      }
      case "Home": {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { focusedRow = 0; focusedCol = 0; scrollRowIntoView(0); }
        else { focusedCol = 0; }
        break;
      }
      case "End": {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { focusedRow = rowLen - 1; focusedCol = visLen - 1; scrollRowIntoView(rowLen - 1); }
        else { focusedCol = visLen - 1; }
        break;
      }
      case "PageDown": {
        e.preventDefault();
        const pdn = Math.min(curRow + 10, rowLen - 1);
        focusedRow = pdn; if (focusedCol === null) focusedCol = 0;
        scrollRowIntoView(pdn);
        break;
      }
      case "PageUp": {
        e.preventDefault();
        const pup = Math.max(curRow - 10, 0);
        focusedRow = pup; if (focusedCol === null) focusedCol = 0;
        scrollRowIntoView(pup);
        break;
      }
      default: {
        // Printable character → start editing with that char (type-to-edit)
        if (
          e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey &&
          focusedRow !== null && focusedCol !== null
        ) {
          const ai = visToActualColIdx(focusedCol);
          if (ai >= 0 && canEditColumn(ai)) {
            const col = columns[ai];
            const isSelectOrToggle = !!getColumnEnumValues(col) || isBooleanType(col?.dataType ?? col?.data_type ?? "");
            if (!isSelectOrToggle) { e.preventDefault(); startEdit(focusedRow, ai, e.key); }
          }
        }
        break;
      }
    }
  }

  onDestroy(() => {
    if (previewShowTimer) clearTimeout(previewShowTimer)
    if (previewHideTimer) clearTimeout(previewHideTimer)

    // Clear staged-edit state in the parent so the StatusBar buttons don't linger.
    pendingEditCount = 0
    applyEdits = () => {}
    resetEdits = () => {}
    scrollToTop = () => {}
    scrollToBottom = () => {}
  })
</script>

{#if loading && columns.length === 0}
  <TableLoading {embedded} />
{:else}
  <ContextMenu.Root
    onOpenChange={(open) => {
      contextMenuOpen = open;
      if (open) {
        armMenuSelectGuard();
      } else {
        pendingContextMenu = false;
        suppressMenuSelect = false;
      }
    }}
  >
    <ContextMenu.Trigger disabled={rows.length === 0}>
      {#snippet child({ props })}
        {@const bitsContextMenu = props.oncontextmenu}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          bind:this={tableContainer}
          {...props}
          tabindex={-1}
          class={cn(
            "app-scroll relative overflow-auto bg-panel select-none outline-none [scrollbar-gutter:stable] [contain:layout] [overflow-anchor:none]",
            embedded ? "max-h-80" : "min-h-0 flex-1",
            resizingColName && "cursor-col-resize",
          )}
          oncontextmenu={(e) => {
            const target = e.target;
            if (!(target instanceof Element)) {
              e.preventDefault();
              return;
            }
            const rowEl = target.closest("[data-row-idx]");
            if (!rowEl) {
              e.preventDefault();
              return;
            }
            const rowIdx = Number(rowEl.getAttribute("data-row-idx"));
            if (!Number.isFinite(rowIdx)) {
              e.preventDefault();
              return;
            }
            // Capture which row/col was right-clicked
            pendingContextMenu = true;
            contextRowIdx = rowIdx;
            const cellEl = target.closest("td[data-col-idx]");
            contextColIdx = cellEl
              ? Number(cellEl.getAttribute("data-col-idx")) || 0
              : 0;
            // Hand off to bits-ui to open the menu
            bitsContextMenu?.(e);
          }}
          onkeydown={handleTableKeydown}
          onfocusin={() => { isTableFocused = true; }}
          onfocusout={(e) => {
            if (!tableContainer?.contains(e.relatedTarget instanceof Element ? e.relatedTarget : null)) {
              isTableFocused = false;
            }
          }}
        >
          {#if visibleColumns.length === 0}{:else}
          <table
            class="studio-data-table w-full table-fixed text-ui-sm"
          >
            <colgroup>
              {#if showRowExpand}
                <col style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px" />
              {/if}
              {#if showSelection}
                <col style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px" />
              {/if}
              {#each visibleColumns as col (col.name)}
                {@const isCollapsed = collapsedColumns.has(col.name)}
                {@const colW = isCollapsed ? COLLAPSED_COL_WIDTH : widthForColumn(col.name, col.dataType ?? col.data_type ?? "")}
                <col style="width: {colW}px" />
              {/each}
              <!-- Auto-width spacer: absorbs any leftover panel width so the
                   real columns keep their exact, stable widths (no reflow on
                   data / column-count / sidebar changes). Collapses to 0 when
                   columns overflow, letting the horizontal scrollbar take over. -->
              <col class="studio-spacer-col" />
            </colgroup>
            <thead class="studio-chrome sticky top-0 z-20 bg-panel">
              <tr>
                {#if showRowExpand}
                  <th
                    class="studio-table-gutter bg-panel"
                    style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                    aria-label="Expand row"
                  >
                    {#if expandedRows.size > 0}
                      <div class="studio-table-gutter-inner">
                        <button
                          type="button"
                          class="flex size-full items-center justify-center text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                          title="Collapse all expanded rows ({expandedRows.size})"
                          aria-label="Collapse all expanded rows"
                          onclick={(e) => { e.stopPropagation(); collapseAllRows(); }}
                        >
                          <ChevronsDownUp class="size-3.5" />
                        </button>
                      </div>
                    {/if}
                  </th>
                {/if}
                {#if showSelection}
                  <th
                    class="studio-table-gutter bg-panel font-normal"
                    style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px"
                  >
                    <div class="studio-table-gutter-inner">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onCheckedChange={(v) => toggleAll(v === true)}
                      />
                    </div>
                  </th>
                {/if}
                {#each visibleColumns as col (col.name)}
                  {@const isCollapsed = collapsedColumns.has(col.name)}
                  {@const isPinned = pinnedColumns.has(col.name)}
                  {@const colW = widthForColumn(col.name, col.dataType ?? col.data_type ?? "")}
                  {@const pinLeft = pinnedOffsets.get(col.name) ?? 0}
                  {@const meta = colMeta.get(col.name)}
                  {#if isCollapsed}
                    <!-- Collapsed column — thin clickable restore strip -->
                    <th
                      title="Click to restore '{col.name}'"
                      class="group/collapsed relative cursor-pointer overflow-hidden bg-panel transition-colors hover:bg-accent/40"
                      style="width: {COLLAPSED_COL_WIDTH}px; min-width: {COLLAPSED_COL_WIDTH}px; max-width: {COLLAPSED_COL_WIDTH}px"
                      onclick={() => restoreColumn(col.name)}
                    >
                      <div class="flex h-full items-center justify-center">
                        <span class="select-none font-mono text-[8px] leading-none text-muted-foreground/50 group-hover/collapsed:text-muted-foreground">···</span>
                      </div>
                    </th>
                  {:else}
                    {@const isSorted = rowSort?.column === col.name}
                    {@const isAsc = isSorted && rowSort?.direction === 'asc'}
                    {@const isDesc = isSorted && rowSort?.direction === 'desc'}
                    <ContextMenu.Root>
                      <ContextMenu.Trigger>
                        {#snippet child({ props })}
                          <th
                            {...props}
                            class={cn(
                              "group/th relative overflow-hidden px-0 py-0 text-left font-normal",
                              resizingColName === col.name && "bg-accent/30",
                              isPinned && "sticky z-[1] bg-panel shadow-[1px_0_0_hsl(var(--border)/0.6)]",
                            )}
                            style="width: {colW}px; min-width: {colW}px; max-width: {colW}px{isPinned ? `; left: ${pinLeft}px` : ''}"
                          >
                            <button
                              type="button"
                              class={cn(
                                "flex h-full w-full min-w-0 cursor-pointer items-center gap-1.5 px-3 py-1 text-left transition-colors hover:bg-accent/40",
                                isSorted && "bg-accent/20",
                              )}
                              onclick={() => handleHeaderSort(col.name)}
                              title="Sort by {col.name}"
                            >
                              <div class="flex min-w-0 flex-1 flex-col gap-px leading-tight">
                                <div class="flex min-w-0 items-center gap-1">
                                  <span
                                    class={cx(
                                      "min-w-0 overflow-hidden whitespace-nowrap font-mono text-ui-sm text-foreground",
                                      col.name.length > 100 && "text-ellipsis",
                                    )}
                                    data-font="mono"
                                    title={col.name}>{col.name}</span
                                  >
                                  {#if meta && (meta.pk || meta.fk || meta.unique || meta.indexed || !meta.nullable)}
                                    <div class="flex shrink-0 items-center gap-[2px]">
                                      {#if meta.pk}
                                        <span
                                          title="Primary key"
                                          class="inline-flex size-[13px] items-center justify-center rounded-sm bg-primary/10 text-primary"
                                        ><KeyRound class="size-[8px]" /></span>
                                      {/if}
                                      {#if meta.fk}
                                        <span
                                          title={fkTooltip(col.name)}
                                          class="inline-flex size-[13px] items-center justify-center rounded-sm bg-muted text-muted-foreground"
                                        ><Link2 class="size-[8px]" /></span>
                                      {/if}
                                      {#if meta.unique && !meta.pk}
                                        <span
                                          title="Unique"
                                          class="inline-flex size-[13px] items-center justify-center rounded-sm bg-muted text-muted-foreground"
                                        ><Fingerprint class="size-[8px]" /></span>
                                      {/if}
                                      {#if meta.indexed}
                                        <span
                                          title="Indexed"
                                          class="inline-flex size-[13px] items-center justify-center rounded-sm bg-muted text-muted-foreground"
                                        ><Zap class="size-[8px]" /></span>
                                      {/if}
                                      {#if !meta.nullable && !meta.pk}
                                        <span
                                          title="Not null"
                                          class="inline-flex size-[13px] items-center justify-center rounded-sm bg-muted text-muted-foreground/60"
                                        ><Circle class="size-[7px] fill-muted-foreground/40" /></span>
                                      {/if}
                                    </div>
                                  {/if}
                                </div>
                                <span
                                  class="block truncate font-mono text-ui-2xs text-muted-foreground"
                                  data-font="mono"
                                  title={col.dataType ?? col.data_type}
                                  >{col.dataType ?? col.data_type}</span
                                >
                              </div>
                              {#if isSorted}
                                <span class="shrink-0 text-primary/70">
                                  {#if isAsc}
                                    <svg class="size-3" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                  {:else}
                                    <svg class="size-3" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                  {/if}
                                </span>
                              {:else}
                                <ArrowUpDown class="size-3 shrink-0 opacity-0 transition-opacity group-hover/th:opacity-30" />
                              {/if}
                            </button>
                            {#if visibleColumns.length > 1}
                              <ColumnResizeHandle
                                onresizestart={() => startColumnResize(col.name)}
                                onresize={applyColumnResize}
                                onresizeend={endColumnResize}
                              />
                            {/if}
                          </th>
                        {/snippet}
                      </ContextMenu.Trigger>
                      <ContextMenu.Content
                        class="w-48 p-0.5 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5"
                      >
                        <ContextMenu.Item onSelect={() => headerSortDirect(col.name, 'asc')}>
                          <ArrowUp />
                          Sort ascending
                          {#if isAsc}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => headerSortDirect(col.name, 'desc')}>
                          <ArrowDown />
                          Sort descending
                          {#if isDesc}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
                        </ContextMenu.Item>
                        {#if isSorted}
                          <ContextMenu.Item onSelect={() => { if (pendingEdits.size > 0) { toast.error('Unsaved changes', { description: 'Apply or reset your edits before sorting.' }); return } onsortchange(null) }}>
                            <ArrowUpDown />
                            Clear sort
                          </ContextMenu.Item>
                        {/if}
                        <ContextMenu.Separator />
                        <ContextMenu.Item onSelect={() => onfiltercolumn(col.name)}>
                          <ListFilter />
                          Filter by this column
                        </ContextMenu.Item>
                        <ContextMenu.Separator />
                        <ContextMenu.Item onSelect={() => toggleColumnPin(col.name)}>
                          {#if isPinned}
                            <PinOff />
                            Unpin column
                          {:else}
                            <Pin />
                            Pin column
                          {/if}
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => onhidecolumn(col.name)}>
                          <EyeOff />
                          Hide column
                        </ContextMenu.Item>
                        <ContextMenu.Separator />
                        <ContextMenu.Item onSelect={() => resetColumnWidth(col.name)}>
                          <RotateCcw />
                          Reset column width
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Root>
                  {/if}
                {/each}
                <th aria-hidden="true" class="studio-spacer-cell bg-panel"></th>
              </tr>
            </thead>
            {#if rows.length > 0}
              <tbody>
                {#if useVirtual && virtualTopPad > 0}
                  <tr aria-hidden="true" style="height: {virtualTopPad}px">
                    <td colspan={totalColSpan} class="border-0 p-0"></td>
                  </tr>
                {/if}
                {#each visibleRowIndexes as idx (idx)}
                  {@const row = rows[idx]}
                  <tr
                    data-row-idx={idx}
                    class={rowClass(idx)}
                    onclick={(e) => {
                      if (e.button !== 0) return;
                      const target = e.target instanceof Element ? e.target : null;
                      // Copy button — delegated so the button itself needs no listener.
                      const copyBtn = target?.closest("[data-copy-cell]");
                      if (copyBtn) {
                        e.stopPropagation();
                        void copyCellValue(idx, Number(copyBtn.getAttribute("data-copy-cell")));
                        return;
                      }
                      if (editingCell) cancelEdit();
                      focusedRow = idx;
                      if (e.shiftKey) {
                        openInInspector(idx);
                        return;
                      }
                      if (inspectorRow !== null) inspectorRow = idx;
                      const cellEl = target?.closest("td[data-col-idx]");
                      if (cellEl) {
                        const ci = Number(cellEl.getAttribute("data-col-idx"));
                        const vi = actualToVisColIdx(ci);
                        if (vi >= 0) focusedCol = vi;
                        // Ctrl/Cmd-click follows a foreign key (formerly on the cell).
                        if (tryFollowForeignKey(idx, ci, e, { requireModifier: true })) return;
                      } else if (focusedCol === null) {
                        focusedCol = 0;
                      }
                      tableContainer?.focus({ preventScroll: true });
                    }}
                    ondblclick={(e) => {
                      const cellEl = e.target instanceof Element ? e.target.closest("td[data-col-idx]") : null;
                      if (!cellEl) return;
                      e.preventDefault();
                      const ci = Number(cellEl.getAttribute("data-col-idx"));
                      // FK cell with a value → follow; otherwise start editing.
                      if (tryFollowForeignKey(idx, ci, e)) return;
                      startEdit(idx, ci);
                    }}
                    onauxclick={(e) => {
                      if (e.button !== 1) return;
                      const cellEl =
                        e.target instanceof Element
                          ? e.target.closest("td[data-col-idx]")
                          : null;
                      if (!cellEl) return;
                      const colIdx =
                        Number(cellEl.getAttribute("data-col-idx")) || 0;
                      if (tryFollowForeignKey(idx, colIdx, e)) return;
                    }}
                  >
                    {#if showRowExpand}
                      <td
                        class="studio-table-gutter studio-table-expand-gutter bg-panel"
                        style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                        aria-expanded={isRowExpanded(idx)}
                        aria-label={isRowExpanded(idx)
                          ? "Collapse row JSON"
                          : "Expand row JSON"}
                        title={isRowExpanded(idx)
                          ? "Collapse row"
                          : "Expand row as JSON"}
                        onclick={(e) => {
                          e.stopPropagation()
                          toggleRowExpand(idx)
                        }}
                      >
                        <div class="studio-table-gutter-inner">
                          <span
                            class={cn(
                              "studio-row-expand-icon flex w-full self-stretch items-center justify-center text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                              isRowExpanded(idx)
                                ? "opacity-100"
                                : "opacity-0 group-hover/row:opacity-100",
                            )}
                            aria-hidden="true"
                          >
                            {#if isRowExpanded(idx)}
                              <ChevronDown class="size-3.5" />
                            {:else}
                              <ChevronRight class="size-3.5" />
                            {/if}
                          </span>
                        </div>
                      </td>
                    {/if}
                    {#if showSelection}
                      <td
                        class="studio-table-gutter bg-panel"
                        style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px"
                        onclick={(e) => {
                          e.stopPropagation()
                          handleRowSelect(idx, e.shiftKey)
                        }}
                      >
                        <div class="studio-table-gutter-inner">
                          <Checkbox
                            tabindex={-1}
                            checked={selected.has(idx)}
                            onCheckedChange={() => {}}
                          />
                        </div>
                      </td>
                    {/if}
                    {#each row as cell, colIdx}
                      {#if hiddenColumns.has(columns[colIdx]?.name)}<!-- skip hidden -->
                      {:else if collapsedColumns.has(columns[colIdx]?.name)}
                        <!-- Collapsed column — render a matching empty strip cell -->
                        <td
                          class="overflow-hidden border-r border-border/20 bg-panel/80 p-0"
                          style="width: {COLLAPSED_COL_WIDTH}px; min-width: {COLLAPSED_COL_WIDTH}px; max-width: {COLLAPSED_COL_WIDTH}px"
                          aria-hidden="true"
                        ></td>
                      {:else}
                        {@const isEditing =
                          editingCell?.rowIdx === idx &&
                          editingCell?.colIdx === colIdx}
                        {@const col = columns[colIdx]}
                        {@const colType = col?.dataType ?? col?.data_type ?? ""}
                        {@const enumValues = getColumnEnumValues(col)}
                        {@const stagedEdit = hasPendingEdits ? pendingEdits.get(idx + ":" + colIdx) : undefined}
                        {@const isDirty = !!stagedEdit}
                        {@const cellValue = stagedEdit ? stagedEdit.value : cell}
                        {@const cellFk = foreignKeyForCell(idx, colIdx)}
                        {@const cellIsNull = cellValue === null || cellValue === undefined}
                        {@const activeFk = cellFk && !cellIsNull}
                        {@const isFocusedCell = !isEditing && focusedRow === idx && focusedCol !== null && columns[colIdx]?.name === navigableColumns[focusedCol]?.name}
                        {@const cellPinned = pinnedColumns.has(col?.name ?? '')}
                        {@const cellPinLeft = cellPinned ? (pinnedOffsets.get(col?.name ?? '') ?? 0) : 0}
                        <!-- Background / text / shadow resolved by priority so the hot
                             cell class avoids tailwind-merge (cx = clsx only). Order
                             matches the previous cn() last-wins behavior exactly. -->
                        {@const canEditCell = canEditColumn(colIdx)}
                        {@const cellBg = isEditing ? "bg-background"
                          : cellPinned ? "bg-panel"
                          : isDirty ? "bg-amber-400/15"
                          : isFocusedCell ? "bg-primary/10"
                          : activeFk ? "bg-accent/15" : ""}
                        {@const cellTextColor = isEditing ? ""
                          : (isFocusedCell || isDirty) ? "text-foreground" : "text-muted-foreground"}
                        {@const cellShadow = isEditing ? ""
                          : cellPinned ? "shadow-[1px_0_0_hsl(var(--border)/0.6)]"
                          : isDirty ? "shadow-[inset_2px_0_0_#f59e0b]" : ""}
                        <td
                          data-col-idx={colIdx}
                          class={cx(
                            "overflow-hidden font-mono",
                            isEditing
                              ? "relative p-0 align-middle ring-2 ring-inset ring-primary"
                              : "group/cell relative whitespace-nowrap px-3 py-0.5",
                            !isEditing && activeFk && "group/fk cursor-pointer transition-colors hover:bg-accent/30",
                            !isEditing && cellPinned && "sticky z-[1]",
                            cellBg, cellTextColor, cellShadow,
                          )}
                          style={isEditing ? "border: 0" : cellPinned ? `left: ${cellPinLeft}px` : undefined}
                          data-font="mono"
                        >
                          {#if isEditing && editingCell}
                            {@const isNullable = col?.nullable ?? true}
                            {#if enumValues}
                              <select
                                bind:this={editInput}
                                bind:value={editingCell.draft}
                                disabled={saving}
                                aria-label="Edit {col?.name ?? 'cell'}"
                                class="box-border block h-7 w-full min-w-0 max-w-full cursor-pointer appearance-none border-0 bg-transparent px-3 py-1 font-mono text-ui-sm text-foreground outline-none"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={handleEditKeydown}
                                onchange={() => void commitEdit()}
                              >
                                {#if isNullable}
                                  <option value="">NULL</option>
                                {/if}
                                {#if editingCell.original && !enumValues.includes(editingCell.original)}
                                  <option value={editingCell.original}
                                    >{editingCell.original}</option
                                  >
                                {/if}
                                {#each enumValues as option (option)}
                                  <option value={option}>{option}</option>
                                {/each}
                              </select>
                            {:else if isBooleanType(colType)}
                              {@const isOn = editingCell.draft === "true"}
                              {@const isNull =
                                isNullable &&
                                editingCell.draft !== "true" &&
                                editingCell.draft !== "false"}
                              <button
                                type="button"
                                bind:this={editInput}
                                disabled={saving}
                                aria-label="Toggle {col?.name ?? 'cell'}"
                                class="flex h-7 w-full items-center gap-2.5 px-3 font-mono text-ui-sm text-foreground outline-none"
                                onclick={async (e) => {
                                  e.stopPropagation();
                                  editingCell.draft =
                                    editingCell.draft === "true"
                                      ? "false"
                                      : "true";
                                  await commitEdit();
                                }}
                                onkeydown={handleEditKeydown}
                              >
                                <span
                                  class={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150",
                                    isOn
                                      ? "bg-primary/80"
                                      : "bg-muted-foreground/30",
                                  )}
                                >
                                  <span
                                    class="absolute size-3 rounded-full bg-white shadow-sm transition-transform duration-150"
                                    style={isOn
                                      ? "transform: translateX(14px)"
                                      : "transform: translateX(2px)"}
                                  ></span>
                                </span>
                                <span
                                  class={isNull ? "text-muted-foreground" : ""}
                                  >{isNull
                                    ? "NULL"
                                    : editingCell.draft === "true"
                                      ? "true"
                                      : "false"}</span
                                >
                              </button>
                            {:else}
                              <input
                                bind:this={editInput}
                                bind:value={editingCell.draft}
                                disabled={saving}
                                aria-label="Edit {col?.name ?? 'cell'}"
                                class="box-border block h-7 w-full min-w-0 max-w-full overflow-x-auto border-0 bg-transparent px-3 py-1 font-mono text-ui-sm text-foreground outline-none [field-sizing:fixed] selection:bg-primary/20"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={handleEditKeydown}
                              />
                            {/if}
                          {:else}
                            {@const cellText = formatCell(cellValue)}
                            {@const cellDisplay = displayCell(cellValue)}
                            {@const isJsonCell = cellValue !== null && typeof cellValue === 'object'}
                            {@const cellHref = !activeFk && !isJsonCell
                              ? cellLinkHref(cellText)
                              : null}
                            {@const urlType = cellUrlType(cellHref, col?.name ?? "")}
                            {#if isJsonCell}
                              <span class="flex min-w-0 items-center gap-1.5">
                                <span class="truncate font-mono text-muted-foreground">{cellDisplay}</span>
                                <button
                                  type="button"
                                  class="inline-flex shrink-0 items-center gap-0.5 rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-[10px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  title="View JSON"
                                  aria-label="View JSON"
                                  onclick={(e) => openJsonLightbox(cellValue, col?.name ?? 'json', e)}
                                >
                                  <Braces class="size-2.5" /> JSON
                                </button>
                              </span>
                            {:else}
                            <span
                              class={cx(
                                "flex items-center gap-1.5 truncate",
                                activeFk && "text-foreground",
                              )}
                              title={activeFk
                                ? `${cellText} — Ctrl/⌘-click or double-click to open ${foreignKeyTargetLabel(cellFk)}`
                                : undefined}
                            >
                              {#if cellHref}
                                <a
                                  href={cellHref}
                                  data-cell-url
                                  tabindex={-1}
                                  class={cx(
                                    "truncate",
                                    urlType === "image" && "cursor-zoom-in",
                                  )}
                                  onclick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                      void openExternal(cellHref);
                                    } else if (
                                      urlType === "image" ||
                                      urlType === "pdf"
                                    ) {
                                      lightboxUrl = cellHref;
                                      lightboxType =
                                        /** @type {'image'|'pdf'} */ (urlType);
                                    } else {
                                      void openExternal(cellHref);
                                    }
                                  }}
                                  onmouseenter={(e) => {
                                    if (urlType)
                                      showUrlPreview(
                                        cellHref,
                                        urlType,
                                        e.currentTarget.getBoundingClientRect(),
                                      );
                                  }}
                                  onmouseleave={scheduleHidePreview}
                                >
                                  {cellDisplay}
                                </a>
                              {:else}
                                <span class="truncate">{cellDisplay}</span>
                              {/if}
                              {#if activeFk}
                                <ExternalLink
                                  class="size-3 shrink-0 text-ring/80 transition-colors group-hover/fk:text-foreground"
                                  aria-hidden="true"
                                />
                              {/if}
                            </span>
                            {/if}
                          {/if}
                          {#if !isEditing}
                            {@const canExpand = canEditCell && !enumValues && !isBooleanType(colType)}
                            {#if canExpand}
                              <button
                                type="button"
                                tabindex={-1}
                                class="absolute right-6 top-1/2 z-10 hidden size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground group-hover/cell:inline-flex hover:bg-accent/60 hover:text-foreground"
                                title="Quick Look (Shift+Space)"
                                aria-label="Open quick look editor"
                                onclick={(e) => { e.stopPropagation(); openQuickLook(idx, colIdx); }}
                              >
                                <Maximize2 class="size-3" />
                              </button>
                            {/if}
                            <button
                              type="button"
                              tabindex={-1}
                              data-copy-cell={colIdx}
                              class="absolute right-0.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground group-hover/cell:inline-flex hover:bg-accent/60 hover:text-foreground"
                            >
                              <Copy class="size-3" />
                            </button>
                          {/if}
                        </td>
                      {/if}
                    {/each}
                    <td aria-hidden="true" class="studio-spacer-cell"></td>
                  </tr>
                  {#if showRowExpand && isRowExpanded(idx)}
                    <tr>
                      <td
                        class="studio-table-gutter bg-panel"
                        style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                        aria-hidden="true"
                      ></td>
                      {#if showSelection}
                        <td
                          class="studio-table-gutter bg-panel"
                          style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px"
                          aria-hidden="true"
                        ></td>
                      {/if}
                      <td colspan={dataColSpan} class="p-0 align-top">
                        <RowExpandViewer
                          record={rowToRecord(columns, row)}
                          rowLabel="row {idx + 1}"
                          maxHeight={embedded ? "min(40vh, 16rem)" : "min(60vh, 32rem)"}
                        />
                      </td>
                    </tr>
                  {/if}
                {/each}
                {#if useVirtual && virtualBottomPad > 0}
                  <tr aria-hidden="true" style="height: {virtualBottomPad}px">
                    <td colspan={totalColSpan} class="border-0 p-0"></td>
                  </tr>
                {/if}
              </tbody>
            {/if}
          </table>
          {/if}
          {#if visibleColumns.length === 0}
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
              role="status"
              aria-live="polite"
            >
              <div class="flex flex-col items-center gap-2 px-4 text-center">
                <Table2 class="size-8 text-muted-foreground/25" />
                <p class="text-ui-sm text-muted-foreground">No columns visible</p>
              </div>
            </div>
          {:else if rows.length === 0}
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
              role="status"
              aria-live="polite"
            >
              <div class="flex flex-col items-center gap-2 px-4 text-center">
                <Table2 class="size-8 text-muted-foreground/25" />
                <p class="text-ui-sm text-muted-foreground">No rows in this table</p>
              </div>
            </div>
          {/if}
        </div>
      {/snippet}
    </ContextMenu.Trigger>

    <ContextMenu.Content
      onOpenAutoFocus={(e) => e.preventDefault()}
      class={cn(
        "w-max min-w-32 p-0.5 text-ui-xs",
        "[&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs",
        "[&_[data-slot=context-menu-shortcut]]:text-ui-2xs",
        "[&_[data-slot=context-menu-item]_svg]:size-3.5",
      )}
    >
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => openInInspector(contextRowIdx))}
      >
        <PanelRight />
        Open
      </ContextMenu.Item>
      {#if menuForeignKey && !menuCellNull}
        <ContextMenu.Item
          onSelect={() =>
            runMenuAction(() =>
              onfollowforeignkey({
                rowIdx: contextRowIdx,
                colIdx: contextColIdx,
              }),
            )}
        >
          <ExternalLink />
          Open {menuForeignKeyLabel}
          <ContextMenu.Shortcut>⌘↵</ContextMenu.Shortcut>
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => toggleColumnPin(menuColName))}
      >
        {#if menuColPinned}
          <PinOff />
          Unpin column
        {:else}
          <Pin />
          Pin column
        {/if}
      </ContextMenu.Item>
      {#if menuColCollapsed}
        <ContextMenu.Item onSelect={() => runMenuAction(() => restoreColumn(menuColName))}>
          <ArrowUpDown />
          Restore column
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item
        disabled={!menuEditable}
        onSelect={() =>
          runMenuAction(() => startEdit(contextRowIdx, contextColIdx))}
      >
        <Pencil />
        Edit
        <ContextMenu.Shortcut>Enter</ContextMenu.Shortcut>
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() =>
          runMenuAction(() => copyCellValue(contextRowIdx, contextColIdx))}
      >
        <Copy />
        Copy
        <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
      </ContextMenu.Item>
      <ContextMenu.Item
        disabled={!menuEditable || menuCellNull}
        onSelect={() =>
          runMenuAction(() => setCellNull(contextRowIdx, contextColIdx))}
      >
        <CircleSlash />
        Set NULL
      </ContextMenu.Item>
      {#if showRowExpand}
        <ContextMenu.Item
          onSelect={() => runMenuAction(() => toggleRowExpand(contextRowIdx))}
        >
          <Braces />
          {isRowExpanded(contextRowIdx)
            ? "Collapse row JSON"
            : "Expand"}
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger>
          <Copy />
          Copy row as
        </ContextMenu.SubTrigger>
        <ContextMenu.SubContent class="w-44 [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
          <ContextMenu.Item onSelect={() => runMenuAction(() => copyAs(contextRowIdx, 'json'))}>
            <Braces />
            JSON
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => runMenuAction(() => copyAs(contextRowIdx, 'csv'))}>
            <Copy />
            CSV
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => runMenuAction(() => copyAs(contextRowIdx, 'plain'))}>
            <Copy />
            Plain text
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => runMenuAction(() => copyAs(contextRowIdx, 'markdown'))}>
            <Copy />
            Markdown table
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => runMenuAction(() => copyAs(contextRowIdx, 'insert'))}>
            <Copy />
            INSERT statement
          </ContextMenu.Item>
        </ContextMenu.SubContent>
      </ContextMenu.Sub>
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => toggleRow(contextRowIdx))}
      >
        <CheckSquare />
        {selected.has(contextRowIdx) ? "Deselect row" : "Select row"}
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item
        variant="destructive"
        disabled={!hasPrimaryKey || saving}
        onSelect={() => runMenuAction(() => deleteRow(contextRowIdx))}
      >
        <Trash2 />
        {selected.size > 1 && selected.has(contextRowIdx)
          ? `Delete ${formatCompactCount(selected.size)} rows`
          : "Delete row"}
        <ContextMenu.Shortcut>⌘⌫</ContextMenu.Shortcut>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
{/if}

{#if previewUrl && previewType && previewAnchorRect}
  <UrlPreviewTooltip
    url={previewUrl}
    type={previewType}
    anchorRect={previewAnchorRect}
    onmouseenter={cancelHidePreview}
    onmouseleave={scheduleHidePreview}
    onopen={() => void openExternal(previewUrl)}
    onexpand={() => {
      if (previewType === "image" || previewType === "pdf") {
        lightboxUrl = previewUrl;
        lightboxType = /** @type {'image'|'pdf'} */ (previewType);
        previewUrl = null;
      }
    }}
  />
{/if}

<MediaLightbox
  url={lightboxUrl}
  type={lightboxType}
  onclose={() => {
    lightboxUrl = null;
  }}
/>

<JsonCellLightbox
  data={jsonLightbox}
  onclose={() => { jsonLightbox = null }}
/>

<CellQuickLook
  bind:cell={quickLookCell}
  {saving}
  oncancel={cancelQuickLook}
  onsave={commitQuickLook}
/>

