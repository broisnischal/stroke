<script>
  import { tick, onDestroy, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Link2 from "@lucide/svelte/icons/link-2";
  import Zap from "@lucide/svelte/icons/zap";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
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
  import { cn } from "$lib/utils.js";
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
  } = $props();

  /** @type {HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null} */
  let editInput = $state(null);
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
  // Threshold lowered so 100+ row tables get virtualization instead of full DOM render.
  // ROW_HEIGHT matches actual rendered height: text-ui-sm (~14.77px) × line-height 1.25
  // = ~18.5px content + 4px py-0.5 padding = ~23px; 24 gives a safe 1px margin.
  // OVERSCAN at 10 pre-renders ~240px outside the viewport on each side — enough
  // buffer for fast scrolling without keeping hundreds of offscreen rows alive.
  const VIRTUAL_THRESHOLD = 100
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

  function formatCell(value) {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
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
    lastEditOriginalValue = rows[rowIdx]?.[colIdx];
    selectOnEditFocus = initialChar === undefined;
    const original = valueToEditString(rows[rowIdx]?.[colIdx]);
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

    try {
      const oldVal = lastEditOriginalValue;
      await onsave({ rowIdx, colIdx, value: parsed.value });
      pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: oldVal, newValue: parsed.value }];
      futureEdits = [];
      editingCell = null;
      toast.success("Saved", { description: `${col.name} updated` });
      if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction);
      else tick().then(() => tableContainer?.focus({ preventScroll: true }));
    } catch (err) {
      toast.error("Save failed", { description: String(err) });
    }
  }

  async function commitEdit() {
    return commitEditWithAction(null);
  }

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

  async function setCellNull(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col || !canEditColumn(colIdx)) return;
    if (rows[rowIdx]?.[colIdx] === null) {
      toast.message("Already NULL");
      return;
    }
    try {
      await onsave({ rowIdx, colIdx, value: null });
      toast.success("Set to NULL", { description: col.name });
    } catch (err) {
      toast.error("Update failed", { description: String(err) });
    }
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

  async function undoEdit() {
    if (!pastEdits.length) return;
    const last = pastEdits[pastEdits.length - 1];
    pastEdits = pastEdits.slice(0, -1);
    futureEdits = [last, ...futureEdits];
    try {
      await onsave({ rowIdx: last.rowIdx, colIdx: last.colIdx, value: last.oldValue });
      focusedRow = last.rowIdx;
      const vi = actualToVisColIdx(last.colIdx);
      focusedCol = vi >= 0 ? vi : 0;
      scrollRowIntoView(last.rowIdx);
      tick().then(() => tableContainer?.focus({ preventScroll: true }));
    } catch (err) {
      pastEdits = [...pastEdits, last];
      futureEdits = futureEdits.slice(1);
      toast.error("Undo failed", { description: String(err) });
    }
  }

  async function redoEdit() {
    if (!futureEdits.length) return;
    const next = futureEdits[0];
    futureEdits = futureEdits.slice(1);
    pastEdits = [...pastEdits, next];
    try {
      await onsave({ rowIdx: next.rowIdx, colIdx: next.colIdx, value: next.newValue });
      focusedRow = next.rowIdx;
      const vi = actualToVisColIdx(next.colIdx);
      focusedCol = vi >= 0 ? vi : 0;
      scrollRowIntoView(next.rowIdx);
      tick().then(() => tableContainer?.focus({ preventScroll: true }));
    } catch (err) {
      futureEdits = [next, ...futureEdits];
      pastEdits = pastEdits.slice(0, -1);
      toast.error("Redo failed", { description: String(err) });
    }
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
    if (e.key === "Enter" && !(e.shiftKey || e.altKey)) {
      e.preventDefault();
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

  const ROW_EXPAND_COL_WIDTH = 32;
  /** Fits 16px checkbox with equal inset; no extra horizontal padding in cells */
  const ROW_SELECT_COL_WIDTH = 32;
  const visibleColumns = $derived(
    columns.filter((c) => !hiddenColumns.has(c.name)),
  );
  const dataColSpan = $derived(visibleColumns.length);
  const totalColSpan = $derived(
    (showRowExpand ? 1 : 0) + (showSelection ? 1 : 0) + visibleColumns.length,
  )
  /** Columns visible to the keyboard — excludes collapsed strips. */
  const navigableColumns = $derived(visibleColumns.filter((c) => !collapsedColumns.has(c.name)))
  /** Total gutter width before the first data column. */
  const gutterTotalWidth = $derived(
    (showRowExpand ? ROW_EXPAND_COL_WIDTH : 0) + (showSelection ? ROW_SELECT_COL_WIDTH : 0),
  )
  /** Map of pinned column name → sticky left offset in px. */
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
  const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD && !embedded)
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
    if (_expandedMin < start) start = Math.max(0, _expandedMin)
    if (focusedRow !== null && focusedRow < start) start = Math.max(0, focusedRow)
    if (editingCell && editingCell.rowIdx < start) start = Math.max(0, editingCell.rowIdx)
    return start
  })
  const virtualEnd = $derived.by(() => {
    if (!useVirtual) return rows.length - 1
    let end = Math.min(rows.length - 1, Math.ceil((_scrollTop + _viewportHeight) / ROW_HEIGHT) + OVERSCAN)
    if (_expandedMax > end) end = Math.min(rows.length - 1, _expandedMax)
    if (focusedRow !== null && focusedRow > end) end = Math.min(rows.length - 1, focusedRow)
    if (editingCell && editingCell.rowIdx > end) end = Math.min(rows.length - 1, editingCell.rowIdx)
    return end
  })
  const virtualTopPad = $derived(virtualStart * ROW_HEIGHT)
  const virtualBottomPad = $derived((rows.length - 1 - virtualEnd) * ROW_HEIGHT)

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
    return cn(
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

  // Reset focus and undo history when the displayed table changes.
  $effect(() => {
    void columnWidthsKey;
    focusedRow = null;
    focusedCol = null;
    pastEdits = [];
    futureEdits = [];
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
  })
</script>

{#if loading}
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
            "app-scroll relative overflow-auto bg-panel select-none outline-none [scrollbar-gutter:stable] [contain:layout] [will-change:transform] [overflow-anchor:none]",
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
          <table
            class="studio-data-table w-max min-w-full table-fixed text-ui-sm"
          >
            <colgroup>

              {#if showRowExpand}
                <col style="width: {ROW_EXPAND_COL_WIDTH}px" />
              {/if}
              {#if showSelection}
                <col style="width: {ROW_SELECT_COL_WIDTH}px" />
              {/if}
              {#each visibleColumns as col (col.name)}
                <col
                  style="width: {widthForColumn(
                    col.name,
                    col.dataType ?? col.data_type ?? '',
                  )}px"
                />
              {/each}
            </colgroup>
            <thead class="studio-chrome sticky top-0 z-20 bg-panel">
              <tr>
                {#if showRowExpand}
                  <th
                    class="studio-table-gutter bg-panel"
                    style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                    aria-label="Expand row"
                  ></th>
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
                    <th
                      class={cn(
                        "group/th relative overflow-hidden px-0 py-1 text-left font-normal",
                        resizingColName === col.name && "bg-accent/30",
                        isPinned && "sticky z-[1] bg-panel shadow-[1px_0_0_hsl(var(--border)/0.6)]",
                      )}
                      style="width: {colW}px; min-width: {colW}px; max-width: {colW}px{isPinned ? `; left: ${pinLeft}px` : ''}"
                    >
                      <button
                        type="button"
                        class={cn(
                          "flex w-full min-w-0 cursor-pointer items-center gap-1.5 px-3 py-0.5 text-left transition-colors hover:bg-accent/40",
                          isSorted && "bg-accent/20",
                        )}
                        onclick={() => handleHeaderSort(col.name)}
                        title="Sort by {col.name}"
                      >
                        <div class="flex min-w-0 flex-1 flex-col gap-px leading-tight">
                          <div class="flex min-w-0 items-center gap-1">
                            <span
                              class="min-w-0 truncate font-mono text-ui-sm text-foreground"
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
                            {#if rowSort?.direction === 'asc'}
                              <svg class="size-3" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            {:else}
                              <svg class="size-3" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 6l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            {/if}
                          </span>
                        {:else}
                          <ArrowUpDown class="size-3 shrink-0 opacity-0 transition-opacity group-hover/th:opacity-30" />
                        {/if}
                      </button>
                      <ColumnResizeHandle
                        onresizestart={() => startColumnResize(col.name)}
                        onresize={applyColumnResize}
                        onresizeend={endColumnResize}
                      />
                    </th>
                  {/if}
                {/each}
              </tr>
            </thead>
            {#if rows.length > 0}
              <tbody>
                {#if useVirtual && virtualTopPad > 0}
                  <tr aria-hidden="true" style="height: {virtualTopPad}px">
                    <td colspan={totalColSpan} class="border-0 p-0"></td>
                  </tr>
                {/if}
                {#each rows.slice(virtualStart, virtualEnd + 1) as row, relIdx (virtualStart + relIdx)}
                  {@const idx = virtualStart + relIdx}
                  <tr
                    data-row-idx={idx}
                    class={rowClass(idx)}
                    onclick={(e) => {
                      if (e.button !== 0) return;
                      if (editingCell) cancelEdit();
                      focusedRow = idx;
                      const cellEl = e.target instanceof Element ? e.target.closest("td[data-col-idx]") : null;
                      if (cellEl) {
                        const vi = actualToVisColIdx(Number(cellEl.getAttribute("data-col-idx")));
                        if (vi >= 0) focusedCol = vi;
                      } else if (focusedCol === null) {
                        focusedCol = 0;
                      }
                      tableContainer?.focus({ preventScroll: true });
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
                        {@const cellFk = foreignKeyForCell(idx, colIdx)}
                        {@const cellIsNull = row[colIdx] === null || row[colIdx] === undefined}
                        {@const activeFk = cellFk && !cellIsNull}
                        {@const isFocusedCell = !isEditing && focusedRow === idx && focusedCol !== null && columns[colIdx]?.name === navigableColumns[focusedCol]?.name}
                        {@const cellPinned = pinnedColumns.has(col?.name ?? '')}
                        {@const cellPinLeft = cellPinned ? (pinnedOffsets.get(col?.name ?? '') ?? 0) : 0}
                        <td
                          data-col-idx={colIdx}
                          class={cn(
                            "overflow-hidden font-mono",
                            isEditing
                              ? "relative p-0 align-middle ring-2 ring-inset ring-primary bg-background"
                              : "group/cell relative whitespace-nowrap px-3 py-0.5 text-muted-foreground",
                            activeFk &&
                              !isEditing &&
                              "group/fk cursor-pointer bg-accent/15 transition-colors hover:bg-accent/30",
                            isFocusedCell && "bg-primary/10 text-foreground",
                            cellPinned && !isEditing && "sticky z-[1] bg-panel shadow-[1px_0_0_hsl(var(--border)/0.6)]",
                          )}
                          style={isEditing ? "border: 0" : cellPinned ? `left: ${cellPinLeft}px` : undefined}
                          data-font="mono"
                          onclick={(e) => {
                            if (
                              tryFollowForeignKey(idx, colIdx, e, {
                                requireModifier: true,
                              })
                            )
                              return;
                          }}
                          ondblclick={(e) => {
                            e.preventDefault();
                            if (activeFk) {
                              tryFollowForeignKey(idx, colIdx, e);
                              return;
                            }
                            startEdit(idx, colIdx);
                          }}
                          onkeydown={(e) => {
                            if (isEditing) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              startEdit(idx, colIdx);
                            }
                          }}
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
                            {@const cellText = formatCell(cell)}
                            {@const cellDisplay = displayCell(cell)}
                            {@const isJsonCell = cell !== null && typeof cell === 'object'}
                            {@const cellHref = !activeFk && !isJsonCell
                              ? cellLinkHref(cellText)
                              : null}
                            {@const urlType = cellUrlType(cellHref)}
                            {#if isJsonCell}
                              <button
                                type="button"
                                class="group/json flex min-w-0 cursor-pointer items-center gap-1 truncate bg-transparent p-0 text-left"
                                onclick={(e) => openJsonLightbox(cell, col?.name ?? 'json', e)}
                                title="Click to view JSON"
                              >
                                <span class="truncate font-mono text-muted-foreground">{cellDisplay}</span>
                                <Braces class="size-3 shrink-0 text-muted-foreground/30 transition-colors group-hover/json:text-muted-foreground" />
                              </button>
                            {:else}
                            <span
                              class={cn(
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
                                  class={cn(
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
                            <button
                              type="button"
                              tabindex={-1}
                              class="absolute right-0.5 top-1/2 z-10 -translate-y-1/2 inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-70 hover:!opacity-100 hover:bg-accent/60 hover:text-foreground"
                              onclick={(e) => { e.stopPropagation(); void copyCellValue(idx, colIdx); }}
                            >
                              <Copy class="size-3" />
                            </button>
                          {/if}
                        </td>
                      {/if}
                    {/each}
                  </tr>
                  {#if showRowExpand && isRowExpanded(idx)}
                    <tr>
                      <td
                        class="studio-table-gutter"
                        style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                        aria-hidden="true"
                      ></td>
                      {#if showSelection}
                        <td
                          class="studio-table-gutter"
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
          {#if rows.length === 0}
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
              role="status"
              aria-live="polite"
            >
              <div class="flex flex-col items-center gap-2 px-4 text-center">
                <Table2 class="size-8 text-muted-foreground/25" />
                <p class="text-ui-sm text-muted-foreground">
                  No rows in this table
                </p>
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
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => copyRowJson(contextRowIdx))}
      >
        <Braces />
        Copy row JSON
      </ContextMenu.Item>
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

