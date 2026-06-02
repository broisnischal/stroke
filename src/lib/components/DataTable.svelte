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
    isLikelyAutoColumn,
    buildInsertPayload,
    isDateOnlyType,
    isTimeOnlyType,
  } from "$lib/cell-value.js";
  import {
    defaultInsertDraft,
    shouldUseDateTimePicker,
    nowDateTimeLocal,
    nowDateOnly,
    nowTimeOnly,
  } from "$lib/insert-field.js";
  import { cellLinkHref, cellUrlType } from "$lib/cell-display.js";
  import MediaLightbox from "./MediaLightbox.svelte";
  import RowExpandViewer from "./RowExpandViewer.svelte";
  import JsonCellLightbox from "./JsonCellLightbox.svelte";
  import CellQuickLook from "./CellQuickLook.svelte";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import Check from "@lucide/svelte/icons/check";
  import Loader from "@lucide/svelte/icons/loader";
  import X from "@lucide/svelte/icons/x";
  import {
    createColorReader,
    withAlpha,
    drawIcon,
    roundRect,
    drawCheckbox,
    drawBadge,
    drawTriangle,
    computeColumnGeometry,
    colDrawnX,
    colAtX,
    resizeColAtX,
    computeRowTops,
    rowAtContentY,
    rowIndexAtY,
  } from "$lib/canvas-table.js";

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
    /** Called when the user confirms the new row draft. Receives the validated values. */
    oninsertrow = /** @type {(values: Record<string, unknown>) => Promise<void>} */ (async () => {}),
    /** True while the insert is in flight — disables the draft row inputs. */
    insertSaving = false,
    /** Assigned by this component so the parent can trigger beginInsertRow(). */
    beginInsertRow = $bindable(/** @type {() => void} */ (() => {})),
    /** When true all write operations (edit, delete, insert) are disabled. */
    readonly = false,
    /** Incremented by the parent when a fresh page of rows is applied
     *  (page/filter/sort/search change). On change the table jumps its scroll
     *  and virtual window back to the top. */
    reloadToken = 0,
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

  /** Draft values for the pending new row, keyed by column name. null = no new row. */
  let newRowDrafts = $state(/** @type {Record<string, string> | null} */ (null))
  /** Name of the column whose input is focused in the new row. */
  let newRowFocusCol = $state(/** @type {string | null} */ (null))

  // ── Column collapse (drag-to-hide) ───────────────────────────────────────
  const COLLAPSED_COL_WIDTH = 12  // px width of the collapsed indicator strip
  const COLLAPSE_ZONE = 40        // drag below this → snap preview + collapse on release
  /** Columns collapsed by dragging the resize handle fully left. */
  let collapsedColumns = $state(/** @type {Set<string>} */ (new Set()))

  // Row height: the canvas paints every body row at this fixed height. Roomier
  // than the old 26px for a calmer, Linear/Drizzle-style rhythm.
  const ROW_HEIGHT = 33
  let _scrollTop = $state(0)
  // Start high so the first paint covers any reasonable screen height before the
  // ResizeObserver fires with the real value.
  let _viewportHeight = $state(1200)

  // ── Canvas rendering ──────────────────────────────────────────────────────
  // The grid is painted to a single <canvas> pinned to the viewport; the bulk
  // cells/header/checkboxes/badges are drawn, and only inherently-interactive
  // bits (active edit input, insert form, expanded JSON, menus, lightboxes) are
  // DOM overlays positioned in content coordinates over the canvas.
  const HEADER_H = 40 // single-line header (name + inline datatype)
  const GUTTER_EXPAND_W = 38
  const GUTTER_SELECT_W = 42
  /** @type {HTMLCanvasElement | null} */
  let canvasEl = $state(null)
  /** @type {HTMLSpanElement | null} */
  let colorProbe = $state(null)
  let _scrollLeft = $state(0)
  let _viewportWidth = $state(800)
  /** Bumped to force a repaint when a non-reactive input (theme) changes. */
  let _redrawToken = $state(0)
  /** Hover target (drawn affordances + tooltip + cursor). */
  let hoveredRow = $state(/** @type {number | null} */ (null))
  let hoveredColName = $state(/** @type {string | null} */ (null))
  /** Column whose right edge the pointer is over in the header (resize cursor). */
  let _resizeHoverCol = $state(/** @type {string | null} */ (null))
  /** Swallow the click that fires right after a resize-drag pointerup. */
  let _suppressNextClick = false
  /** Lightweight canvas tooltip (replaces lost title= attributes). */
  let _tooltip = $state(/** @type {{ x: number, y: number, text: string } | null} */ (null))
  let _tooltipTimer = 0
  /** Right-click target kind, so one ContextMenu can show header vs body items. */
  let contextIsHeader = $state(false)
  let contextHeaderCol = $state("")

  // Map a visible/any column name → its index in the full `columns` array
  // (rows[] are indexed by the full column order, including hidden columns).
  const _nameToActualIdx = $derived.by(() => {
    /** @type {Map<string, number>} */
    const m = new Map()
    columns.forEach((c, i) => m.set(c.name, i))
    return m
  })

  /** Extra body offset for the inline insert-row slot (a DOM overlay). */
  const insertRowOffset = $derived(newRowDrafts ? ROW_HEIGHT : 0)
  /** Fixed height of an expanded JSON detail slot. */
  const expandHeight = $derived(
    embedded
      ? Math.min(0.4 * _viewportHeight, 256)
      : Math.min(0.6 * _viewportHeight, 512),
  )

  // ── Lightbox (click-to-open image / PDF) ──────────────────────────────────
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
    if (readonly) return false;
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
    if (!tableContainer) return
    const top = rowDocTop(rowIdx)
    const bottom = top + ROW_HEIGHT
    const ch = tableContainer.clientHeight
    const st = tableContainer.scrollTop
    // Keep the row clear of the pinned header band at the top of the viewport.
    if (top - HEADER_H < st) {
      tableContainer.scrollTop = Math.max(0, top - HEADER_H)
    } else if (bottom > st + ch) {
      tableContainer.scrollTop = bottom - ch
    }
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
    if (readonly) return;
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
  /** @param {'down'|'right'|'left'|null} afterAction @param {boolean} [autoEdit] */
  async function commitEditWithAction(afterAction, autoEdit = false) {
    if (!editingCell || saving) return;

    const { rowIdx, colIdx, draft } = editingCell;
    const col = columns[colIdx];
    if (!col) return;

    if (draft === editingCell.original) {
      editingCell = null;
      if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction, autoEdit);
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
    if (afterAction) navigateAfterEdit(rowIdx, colIdx, afterAction, autoEdit);
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

  // Surface beginInsertRow to the parent (→ toolbar Add Row button).
  $effect(() => {
    beginInsertRow = () => {
      if (readonly) return;
      /** @type {Record<string, string>} */
      const drafts = {}
      for (const col of columns) {
        drafts[col.name] = defaultInsertDraft(col, primaryKey)
      }
      newRowDrafts = drafts
      // Focus first non-auto visible column
      const first = visibleColumns.find(c => {
        const dt = c.dataType ?? c.data_type ?? ''
        return !isLikelyAutoColumn(dt, c.name, primaryKey)
      })
      newRowFocusCol = first?.name ?? visibleColumns[0]?.name ?? null
      // Scroll to top so the draft row is visible
      tableContainer?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })

  function cancelNewRow() {
    newRowDrafts = null
    newRowFocusCol = null
  }

  async function submitNewRow() {
    if (!newRowDrafts || insertSaving) return
    const editableCols = columns.filter(c => isEditableType(c.dataType ?? c.data_type ?? ''))
    const built = buildInsertPayload(editableCols, primaryKey, newRowDrafts)
    if (!built.ok) {
      toast.error('Cannot insert row', { description: built.message })
      return
    }
    await oninsertrow(/** @type {Record<string, unknown>} */ (built.values))
    newRowDrafts = null
    newRowFocusCol = null
  }

  /** @param {string} colName @param {string} value */
  function setNewRowDraft(colName, value) {
    if (!newRowDrafts) return
    newRowDrafts = { ...newRowDrafts, [colName]: value }
  }

  /** @param {KeyboardEvent} e */
  function onNewRowKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); cancelNewRow(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submitNewRow(); return }
  }

  // Auto-focus the new-row input when focus column changes.
  $effect(() => {
    const col = newRowFocusCol
    if (!col || !newRowDrafts) return
    tick().then(() => {
      const el = /** @type {HTMLElement|null} */ (
        document.querySelector(`[data-new-row-input="${col}"]`)
      )
      el?.focus()
    })
  })


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
    if (readonly) return;
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

  /** @param {number} rowIdx @param {number} colIdx @param {'down'|'right'|'left'} action @param {boolean} [autoEdit] */
  function navigateAfterEdit(rowIdx, colIdx, action, autoEdit = false) {
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
    tick().then(() => {
      if (autoEdit && focusedRow !== null && focusedCol !== null) {
        const ai = visToActualColIdx(focusedCol)
        if (ai >= 0) startEdit(focusedRow, ai)
      } else {
        tableContainer?.focus({ preventScroll: true })
      }
    })
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
      void commitEditWithAction(e.shiftKey ? "left" : "right", true);
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

  const ROW_EXPAND_COL_WIDTH = 40;
  /** Fits 16px checkbox with equal inset; no extra horizontal padding in cells */
  const ROW_SELECT_COL_WIDTH = 40;
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

  // ── Canvas geometry (single source of truth for draw + hit-test) ───────────
  const gutterWidth = $derived(
    (showRowExpand ? GUTTER_EXPAND_W : 0) + (showSelection ? GUTTER_SELECT_W : 0),
  )
  const geom = $derived(
    computeColumnGeometry({
      columns: visibleColumns.map((c) => ({ name: c.name, dataType: c.dataType ?? c.data_type ?? '' })),
      widthOf: (name) => widthForColumn(name, ''),
      isPinned: (name) => pinnedColumns.has(name),
      gutterWidth,
    }),
  )
  const rowTops = $derived(computeRowTops(rows.length, expandedRows, expandHeight, ROW_HEIGHT))
  /** Total scrollable content height incl. header + insert slot + body. */
  const contentHeight = $derived(HEADER_H + insertRowOffset + (rowTops[rows.length] ?? 0))

  /** Document-space y of a body row's top (0 = top of the sizer). */
  function rowDocTop(/** @type {number} */ idx) {
    return HEADER_H + insertRowOffset + (rowTops[idx] ?? idx * ROW_HEIGHT)
  }
  /** Viewport y of a body row's top. */
  function rowViewportY(/** @type {number} */ idx) {
    return rowDocTop(idx) - _scrollTop
  }
  // Stable key that changes only when column names change — prevents the
  // column-widths $effect from re-running on every row fetch (same columns, new array ref).
  const _columnNamesKey = $derived(columns.map((c) => c.name).join('\x00'))

  // When the parent applies a fresh page of rows (page/filter/sort/search), jump
  // back to the top. Resetting _scrollTop in the same pre-paint flush keeps the
  // virtual window matched to the new scroll position, so the swap renders the
  // small top slice directly instead of a stale mid-table window that then
  // snaps — that snap is both the "scroll jumps" glitch and an extra re-render.
  let _firstReload = true
  $effect(() => {
    void reloadToken
    if (_firstReload) { _firstReload = false; return }
    untrack(() => {
      _scrollTop = 0
      _scrollLeft = 0
      if (tableContainer) {
        if (tableContainer.scrollTop !== 0) tableContainer.scrollTop = 0
        if (tableContainer.scrollLeft !== 0) tableContainer.scrollLeft = 0
      }
    })
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

  // Per-column stable cache — computed once per column/schema change instead of
  // once per cell per render. getColumnEnumValues, canEditColumn, and fkByColumn
  // were previously called rows×cols times on every reactive update.
  const _colCache = $derived.by(() => columns.map((col, colIdx) => ({
    colType: col?.dataType ?? col?.data_type ?? '',
    enumValues: getColumnEnumValues(col),
    canEdit: !readonly && primaryKey.length > 0 && isEditableType(col?.dataType ?? col?.data_type ?? ''),
    fk: fkByColumn[col?.name ?? ''] ?? null,
  })))

  const colMeta = $derived.by(() => {
    /** @type {Map<string, { pk: boolean, fk: boolean, indexed: boolean, unique: boolean, nullable: boolean }>} */
    const map = new Map()
    for (const col of columns) {
      const colIndexes = _indexesByCol.get(col.name) ?? []
      // Single pass instead of two .some() — early exits once both flags are found
      let unique = false, indexed = false
      for (const idx of colIndexes) {
        if (!unique && idx.isUnique && !idx.isPrimary) unique = true
        else if (!indexed && !idx.isPrimary && !idx.isUnique) indexed = true
        if (unique && indexed) break
      }
      map.set(col.name, {
        pk: _pkSet.has(col.name),
        fk: _fkCols.has(col.name),
        unique,
        indexed,
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

  // Scroll is wired via the template `onscroll` handler (reactive) → onContainerScroll.
  // This effect only tracks the viewport size.
  $effect(() => {
    const container = tableContainer
    if (!container) return
    _viewportWidth = container.clientWidth
    _viewportHeight = container.clientHeight
    _scrollTop = container.scrollTop
    _scrollLeft = container.scrollLeft

    // Resize is rare; one RAF is fine to avoid hammering during window drag.
    let roRafId = 0
    const ro = new ResizeObserver(() => {
      if (roRafId) return
      roRafId = requestAnimationFrame(() => {
        roRafId = 0
        _viewportWidth = container.clientWidth
        _viewportHeight = container.clientHeight
      })
    })
    ro.observe(container)
    return () => {
      if (roRafId) cancelAnimationFrame(roRafId)
      ro.disconnect()
    }
  })

  /** @param {Event & { currentTarget: HTMLElement }} e */
  function onContainerScroll(e) {
    const el = e.currentTarget
    if (el.scrollTop !== _scrollTop) _scrollTop = el.scrollTop
    if (el.scrollLeft !== _scrollLeft) _scrollLeft = el.scrollLeft
  }

  // ── Canvas backing context + colour reader ────────────────────────────────
  // Plain (non-reactive) holders. Canvas sizing + drawing happen together in the
  // single master effect below — keeping them in ONE effect avoids any read+write
  // ping-pong between separate effects.
  /** @type {CanvasRenderingContext2D | null} */
  let _ctx = null
  /** @type {ReturnType<typeof createColorReader> | null} */
  let _readColor = null
  /** Canvas font strings measured from the DOM so they exactly match the app's
   *  computed type scale + the real loaded mono font (avoids fallback tofu). */
  let _fonts = /** @type {{ cell: string, type: string, header: string, family: string, cellPx: number, typePx: number } | null} */ (null)

  /** Read the real computed mono fonts for cells / datatypes off the probe. */
  function readFonts(/** @type {HTMLElement} */ probe) {
    const prevClass = probe.className
    const measure = (/** @type {string} */ cls) => {
      probe.className = cls
      const cs = getComputedStyle(probe)
      return { px: parseFloat(cs.fontSize) || 13, family: cs.fontFamily }
    }
    const cell = measure('font-mono text-ui-sm')
    const type = measure('font-mono text-ui-2xs')
    probe.className = prevClass
    return {
      family: cell.family,
      cellPx: cell.px,
      typePx: type.px,
      cell: `${cell.px}px ${cell.family}`,
      type: `${type.px}px ${type.family}`,
      // Medium-weight header name (Linear/Drizzle style).
      header: `530 ${cell.px}px ${cell.family}`,
    }
  }

  // Repaint once webfonts finish loading — the canvas may first paint with a
  // fallback font that lacks glyphs (e.g. ʻ, macrons) and renders them as tofu.
  $effect(() => {
    if (typeof document === 'undefined' || !document.fonts) return
    let cancelled = false
    document.fonts.ready.then(() => {
      if (cancelled) return
      _fonts = null
      _readColor = null
      _redrawToken++
    })
    return () => { cancelled = true }
  })

  // Recreate the colour cache when the theme flips (the probe resolves the new
  // computed colours). The bump runs in a MutationObserver callback (not an
  // effect body), so reading _redrawToken here is not a tracked dependency.
  $effect(() => {
    const probe = colorProbe
    if (!probe || typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(() => {
      _readColor = createColorReader(probe)
      _redrawToken++
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    return () => mo.disconnect()
  })

  // The focused-cell highlight is painted directly on the canvas by draw(),
  // which depends on focusedRow/focusedCol and so repaints on focus changes.

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

  // ── Canvas drawing ─────────────────────────────────────────────────────────
  const CELL_PAD_X = 16
  const ICON_HIT = 24 // hover-button hit width

  /** Truncate `text` to fit `maxW` px under the current ctx.font, adding `…`. */
  function truncText(ctx, text, maxW) {
    if (maxW <= 0) return ''
    if (ctx.measureText(text).width <= maxW) return text
    let lo = 0, hi = text.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid
      else hi = mid - 1
    }
    return text.slice(0, lo) + '…'
  }

  /** Right-aligned hover-button rects for a cell (viewport coords). */
  function cellButtonRects(cellX, w, ry, rh, { canExpand }) {
    const right = cellX + w
    const cy = ry + rh / 2
    const copy = { x: right - 4 - ICON_HIT, y: ry, w: ICON_HIT, h: rh, cx: right - 4 - ICON_HIT / 2, cy }
    const quick = canExpand
      ? { x: copy.x - ICON_HIT, y: ry, w: ICON_HIT, h: rh, cx: copy.x - ICON_HIT / 2, cy }
      : null
    return { copy, quick }
  }

  function draw() {
    const ctx = _ctx
    const read = _readColor
    if (!ctx || !read || !canvasEl || !colorProbe) return
    if (!_fonts) _fonts = readFonts(colorProbe)

    const W = _viewportWidth
    const H = _viewportHeight
    const n = rows.length

    // Resolve theme colours (cached for the frame by the reader).
    const cPanel = read('var(--panel)')
    const cFg = read('var(--foreground)')
    const cMuted = read('var(--muted-foreground)')
    const cGrid = read('var(--table-grid)')
    const cBorder = read('var(--border)')
    const cRing = read('var(--ring)')
    const cMutedBg = read('var(--muted)')
    const cAccent = read('var(--accent)')
    const cPrimary = read('var(--primary)')
    // Primary cell value text — crisper than muted (Drizzle/Linear feel), but a
    // hair softer than full foreground so focused/dirty cells still stand out.
    const cText = withAlpha(cFg, 0.86)
    const AMBER = 'rgb(245, 158, 11)'
    const AMBER_FG = 'rgba(251, 191, 36, 0.85)'
    const BLUE_FG = 'rgba(96, 165, 250, 0.8)'

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = cPanel
    ctx.fillRect(0, 0, W, H)

    const usedW = Math.max(0, Math.min(W, geom.totalWidth - _scrollLeft))
    const navName = focusedCol !== null ? navigableColumns[focusedCol]?.name : null

    // ── Body ─────────────────────────────────────────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, HEADER_H, W, Math.max(0, H - HEADER_H))
    ctx.clip()
    ctx.textBaseline = 'middle'

    const bodyTopY = Math.max(0, _scrollTop - HEADER_H - insertRowOffset)
    let i = rowIndexAtY(rowTops, n, bodyTopY)
    for (; i < n; i++) {
      const ry = rowViewportY(i)
      if (ry >= H) break
      if (ry + ROW_HEIGHT <= HEADER_H) continue
      drawBodyRow(ctx, i, ry, {
        cFg, cText, cMuted, cGrid, cMutedBg, cRing, cAccent, cPanel, usedW, navName,
        AMBER, BLUE_FG, cPrimary,
      })
    }
    ctx.restore()

    // ── Header (pinned) ────────────────────────────────────────────────────
    drawHeaderRow(ctx, {
      W, cPanel, cFg, cMuted, cGrid, cBorder, cMutedBg, cAccent, cPrimary, cRing,
      AMBER, AMBER_FG, BLUE_FG, usedW,
    })
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawBodyRow(ctx, idx, ry, c) {
    const rh = ROW_HEIGHT
    // Row background (selected > focused > hover).
    let bgA = 0
    const isSel = selected.has(idx)
    if (isSel) bgA = 0.3
    else if (focusedRow === idx) bgA = 0.2
    else if (hoveredRow === idx) bgA = 0.18
    if (bgA) {
      ctx.fillStyle = withAlpha(c.cMutedBg, bgA)
      ctx.fillRect(0, ry, c.usedW, rh)
    }

    // Non-pinned cells, clipped to the right of the frozen gutters. Pinned
    // columns are painted afterwards on top, so non-pinned slide under them.
    ctx.save()
    ctx.beginPath()
    ctx.rect(gutterWidth, ry, Math.max(0, _viewportWidth - gutterWidth), rh)
    ctx.clip()
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx + col.w <= gutterWidth || dx >= _viewportWidth) continue
      drawCell(ctx, idx, col, dx, ry, rh, c)
    }
    ctx.restore()

    // Pinned cells on top (frozen left, after gutters).
    for (const col of geom.cols) {
      if (!col.pinned) continue
      const dx = colDrawnX(col, geom, _scrollLeft)
      drawCell(ctx, idx, col, dx, ry, rh, c, true)
    }

    // Gutters (frozen left, on top of everything).
    drawRowGutters(ctx, idx, ry, rh, c)

    // Row ring when focused + selected.
    if (focusedRow === idx && isSel) {
      ctx.strokeStyle = withAlpha(c.cRing, 0.4)
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, ry + 0.5, c.usedW - 1, rh - 1)
    }

    // Bottom grid line.
    ctx.strokeStyle = c.cGrid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, ry + rh - 0.5)
    ctx.lineTo(c.usedW, ry + rh - 0.5)
    ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawCell(ctx, idx, col, cellX, ry, rh, c, pinned = false) {
    const w = col.w
    const actualIdx = _nameToActualIdx.get(col.name) ?? -1
    const cached = _colCache[actualIdx]
    const isCollapsed = collapsedColumns.has(col.name)

    if (pinned) {
      ctx.fillStyle = c.cPanel
      ctx.fillRect(cellX, ry, w, rh)
    }

    if (isCollapsed) {
      ctx.fillStyle = withAlpha(c.cPanel, 0.8)
      ctx.fillRect(cellX, ry, w, rh)
      ctx.strokeStyle = c.cGrid
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cellX + w - 0.5, ry); ctx.lineTo(cellX + w - 0.5, ry + rh); ctx.stroke()
      return
    }

    const editing = editingCell && editingCell.rowIdx === idx && editingCell.colIdx === actualIdx
    const staged = hasPendingEdits ? pendingEdits.get(idx + ':' + actualIdx) : undefined
    const isDirty = !!staged
    const value = staged ? staged.value : rows[idx]?.[actualIdx]
    const isNull = value === null || value === undefined
    const isJson = !isNull && typeof value === 'object'
    const fk = cached?.fk ?? null
    const activeFk = fk && !isNull
    const isFocusedCell = focusedRow === idx && c.navName === col.name && !editing

    // Cell background tints.
    if (!editing) {
      if (isDirty) { ctx.fillStyle = withAlpha(c.AMBER, 0.15); ctx.fillRect(cellX, ry, w, rh) }
      else if (activeFk) { ctx.fillStyle = withAlpha(c.cAccent, 0.15); ctx.fillRect(cellX, ry, w, rh) }
    } else {
      // Active edit cell — overlay input covers it; leave panel + ring.
      ctx.strokeStyle = c.cPrimary
      ctx.lineWidth = 2
      ctx.strokeRect(cellX + 1, ry + 1, w - 2, rh - 2)
    }

    // Vertical grid separator at right edge.
    ctx.strokeStyle = c.cGrid
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cellX + w - 0.5, ry); ctx.lineTo(cellX + w - 0.5, ry + rh); ctx.stroke()

    // Dirty inset marker.
    if (isDirty && !editing) {
      ctx.fillStyle = c.AMBER
      ctx.fillRect(cellX, ry, 2, rh)
    }

    if (editing) return // text drawn by the DOM overlay

    // Text.
    const textColor = isFocusedCell || isDirty || activeFk ? c.cFg
      : isNull ? c.cMuted
      : c.cText
    const text = displayCell(value)
    ctx.font = _fonts.cell
    ctx.fillStyle = textColor
    const rowHover = hoveredRow === idx
    const isHover = rowHover && hoveredColName === col.name
    const canExpand = (cached?.canEdit ?? false) && !cached?.enumValues && !isBooleanType(cached?.colType ?? '')
    // Reserve room on the right for hover buttons / fk icon / json pill.
    let rightReserve = 0
    if (isHover) rightReserve += ICON_HIT + (canExpand ? ICON_HIT : 0)
    if (activeFk && rowHover) rightReserve += 18
    const textMaxW = w - CELL_PAD_X * 2 - rightReserve
    const shown = truncText(ctx, text, textMaxW)
    ctx.textAlign = 'left'
    ctx.fillText(shown, cellX + CELL_PAD_X, ry + rh / 2 + 0.5)

    // JSON pill indicator.
    if (isJson) {
      const pillW = 30, pillH = 13
      const px = cellX + w - CELL_PAD_X - pillW - (isHover ? ICON_HIT : 0)
      const py = ry + (rh - pillH) / 2
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.5)
      roundRect(ctx, px, py, pillW, pillH, 2.5); ctx.fill()
      ctx.fillStyle = c.cMuted
      ctx.font = `600 9px ${_fonts.family}`
      ctx.textAlign = 'left'
      ctx.fillText('JSON', px + 8, py + pillH / 2 + 0.5)
      drawIcon(ctx, 'braces', px + 1.5, py + 2.5, 8, c.cMuted, 2.2)
    }

    // FK external-link icon — only on row hover (keeps the grid uncluttered).
    if (activeFk && rowHover) {
      drawIcon(ctx, 'external-link', cellX + w - CELL_PAD_X - 13 - (isHover ? ICON_HIT : 0), ry + rh / 2 - 6, 12, withAlpha(c.cRing, 0.9), 2)
    }

    // Focused-cell outline.
    if (isFocusedCell) {
      ctx.strokeStyle = withAlpha(c.cRing, 0.4)
      ctx.lineWidth = 1
      ctx.strokeRect(cellX + 0.5, ry + 0.5, w - 1, rh - 1)
    }

    // Hover buttons (copy + quick look).
    if (isHover) {
      const { copy, quick } = cellButtonRects(cellX, w, ry, rh, { canExpand })
      drawIcon(ctx, 'copy', copy.cx - 7, copy.cy - 7, 14, c.cMuted, 1.8)
      if (quick) drawIcon(ctx, 'maximize-2', quick.cx - 7, quick.cy - 7, 14, c.cMuted, 1.8)
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawRowGutters(ctx, idx, ry, rh, c) {
    if (gutterWidth <= 0) return
    ctx.fillStyle = c.cPanel
    ctx.fillRect(0, ry, gutterWidth, rh)
    let gx = 0
    if (showRowExpand) {
      const expanded = expandedRows.has(idx)
      const hov = hoveredRow === idx
      if (expanded || hov) {
        drawIcon(ctx, expanded ? 'chevron-down' : 'chevron-right',
          gx + (GUTTER_EXPAND_W - 14) / 2, ry + (rh - 14) / 2, 14,
          expanded ? c.cFg : c.cMuted, 2)
      }
      gx += GUTTER_EXPAND_W
    }
    if (showSelection) {
      drawCheckbox(ctx, gx + (GUTTER_SELECT_W - 16) / 2, ry + (rh - 16) / 2, 16,
        { checked: selected.has(idx) },
        { border: c.cMuted, fill: c.cPrimary, mark: c.cPanel })
      gx += GUTTER_SELECT_W
    }
    // Gutter right separator.
    ctx.strokeStyle = c.cGrid
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gutterWidth - 0.5, ry); ctx.lineTo(gutterWidth - 0.5, ry + rh); ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawHeaderRow(ctx, c) {
    ctx.fillStyle = c.cPanel
    ctx.fillRect(0, 0, c.W, HEADER_H)

    // Non-pinned headers, clipped to the right of the frozen gutters.
    ctx.save()
    ctx.beginPath()
    ctx.rect(gutterWidth, 0, Math.max(0, c.W - gutterWidth), HEADER_H)
    ctx.clip()
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx + col.w <= gutterWidth || dx >= c.W) continue
      drawHeaderCell(ctx, col, dx, c)
    }
    ctx.restore()

    // Pinned headers.
    for (const col of geom.cols) {
      if (!col.pinned) continue
      drawHeaderCell(ctx, col, colDrawnX(col, geom, _scrollLeft), c)
    }

    // Gutter headers.
    if (gutterWidth > 0) {
      ctx.fillStyle = c.cPanel
      ctx.fillRect(0, 0, gutterWidth, HEADER_H)
      let gx = 0
      if (showRowExpand) {
        if (expandedRows.size > 0) {
          drawIcon(ctx, 'chevrons-down-up', gx + (GUTTER_EXPAND_W - 14) / 2, (HEADER_H - 14) / 2, 14, c.cMuted, 2)
        }
        gx += GUTTER_EXPAND_W
      }
      if (showSelection) {
        drawCheckbox(ctx, gx + (GUTTER_SELECT_W - 16) / 2, (HEADER_H - 16) / 2, 16,
          { checked: allSelected, indeterminate: someSelected },
          { border: c.cMuted, fill: c.cPrimary, mark: c.cPanel })
        gx += GUTTER_SELECT_W
      }
      ctx.strokeStyle = c.cGrid
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(gutterWidth - 0.5, 0); ctx.lineTo(gutterWidth - 0.5, HEADER_H); ctx.stroke()
    }

    // Header bottom border (stronger).
    ctx.strokeStyle = c.cBorder
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, HEADER_H - 0.5); ctx.lineTo(c.W, HEADER_H - 0.5); ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawHeaderCell(ctx, col, x, c) {
    const w = col.w
    const sorted = rowSort?.column === col.name
    const collapsed = collapsedColumns.has(col.name)

    // Pinned headers are painted on top of scrolled columns — give them an opaque
    // backing so the columns sliding underneath don't bleed through.
    if (col.pinned) { ctx.fillStyle = c.cPanel; ctx.fillRect(x, 0, w, HEADER_H) }

    // Background tint.
    if (resizingColName === col.name) { ctx.fillStyle = withAlpha(c.cAccent, 0.3); ctx.fillRect(x, 0, w, HEADER_H) }
    else if (sorted) { ctx.fillStyle = withAlpha(c.cMutedBg, 0.3); ctx.fillRect(x, 0, w, HEADER_H) }

    // Right grid separator.
    ctx.strokeStyle = c.cGrid
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + w - 0.5, 0); ctx.lineTo(x + w - 0.5, HEADER_H); ctx.stroke()

    if (collapsed) {
      ctx.fillStyle = withAlpha(c.cMuted, 0.5)
      ctx.font = `8px ${_fonts.family}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('···', x + w / 2, HEADER_H / 2)
      return
    }

    const meta = colMeta.get(col.name)
    const cy = HEADER_H / 2
    const sortReserve = 18
    // Single line, vertically centered (Drizzle/Linear style): bold name, then
    // metadata badges, then the inline muted datatype, with a sort chevron at the
    // right edge.
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    const badges = []
    if (meta) {
      if (meta.pk) badges.push({ letter: 'K', bg: withAlpha(c.AMBER, 0.15), fg: c.AMBER_FG })
      if (meta.fk) badges.push({ letter: 'F', bg: 'rgba(59,130,246,0.12)', fg: c.BLUE_FG })
      if (meta.unique && !meta.pk) badges.push({ letter: 'U', bg: withAlpha(c.cMutedBg, 0.6), fg: withAlpha(c.cMuted, 0.7) })
      if (meta.indexed) badges.push({ letter: 'I', bg: withAlpha(c.cMutedBg, 0.6), fg: withAlpha(c.cMuted, 0.6) })
      if (!meta.nullable && !meta.pk) badges.push({ dot: true, bg: withAlpha(c.cMutedBg, 0.4), fg: withAlpha(c.cMuted, 0.5) })
    }
    const badgeW = badges.length * 16

    // Name (medium weight).
    ctx.font = _fonts.header
    ctx.fillStyle = c.cFg
    const nameMaxW = w - CELL_PAD_X - sortReserve - badgeW - 8
    const name = truncText(ctx, col.name, Math.max(0, nameMaxW))
    ctx.fillText(name, x + CELL_PAD_X, cy + 0.5)
    let tx = x + CELL_PAD_X + ctx.measureText(name).width + 7

    // Badges.
    for (const b of badges) {
      drawBadge(ctx, tx, cy - 6.5, 13, { bg: b.bg, fg: b.fg, letter: b.letter ?? '', dot: b.dot })
      tx += 16
    }

    // Inline datatype (muted), only if there's comfortable room.
    const typeRoom = x + w - sortReserve - 4 - tx
    if (typeRoom > 22 && col.dataType) {
      ctx.font = _fonts.type
      ctx.fillStyle = withAlpha(c.cMuted, 0.75)
      ctx.fillText(truncText(ctx, col.dataType, typeRoom), tx + (badges.length ? 4 : 2), cy + 0.5)
    }

    // Sort indicator (active = solid; hovered header = faint affordance).
    if (sorted) {
      const dir = rowSort?.direction === 'asc' ? 'up' : 'down'
      drawTriangle(ctx, x + w - 10, cy, 4, dir, withAlpha(c.cPrimary, 0.85))
    } else if (_resizeHoverCol !== col.name && hoveredColName === col.name && hoveredRow === null) {
      drawTriangle(ctx, x + w - 10, cy - 3.5, 3, 'up', withAlpha(c.cMuted, 0.35))
      drawTriangle(ctx, x + w - 10, cy + 3.5, 3, 'down', withAlpha(c.cMuted, 0.35))
    }

    // Resize-edge affordance.
    if (_resizeHoverCol === col.name || resizingColName === col.name) {
      ctx.strokeStyle = withAlpha(c.cPrimary, 0.7)
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x + w - 1, 5); ctx.lineTo(x + w - 1, HEADER_H - 5); ctx.stroke()
    }
  }

  // Master effect — sizes the canvas backing store (DPR-aware) and repaints.
  // Doing both here, and never reading+writing the same signal, keeps it a pure
  // sink: it tracks every input that affects the grid and writes no reactive
  // state, so it can't loop.
  $effect(() => {
    void rows; void columns; void columnWidths; void collapsedColumns
    void pinnedColumns; void hiddenColumns; void selected; void focusedRow
    void focusedCol; void editingCell; void pendingEdits; void expandedRows
    void rowSort; void _scrollTop; void _scrollLeft; void _viewportWidth
    void _viewportHeight; void hoveredRow; void hoveredColName; void _resizeHoverCol
    void resizingColName; void newRowDrafts; void insertSaving; void colMeta
    void geom; void rowTops; void _redrawToken; void foreignKeys; void indexes
    void _colCache

    const canvas = canvasEl
    const probe = colorProbe
    if (!canvas || !probe) return
    if (!_readColor) _readColor = createColorReader(probe)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const bw = Math.max(1, Math.round(_viewportWidth * dpr))
    const bh = Math.max(1, Math.round(_viewportHeight * dpr))
    // Only touch canvas.width/height when it actually changes — assigning clears
    // the canvas, and we want to avoid a redundant clear on every repaint.
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
      canvas.style.width = _viewportWidth + 'px'
      canvas.style.height = _viewportHeight + 'px'
    }
    _ctx = canvas.getContext('2d')
    if (_ctx) _ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  })

  // ── Canvas pointer interaction ──────────────────────────────────────────
  function canvasXY(/** @type {{ clientX: number, clientY: number }} */ e) {
    const r = canvasEl?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /**
   * Hit-test a viewport point.
   * @returns {{ kind: string, idx?: number, col?: any, actualIdx?: number, drawnX?: number, x?: number, y?: number }}
   */
  function hitTest(x, y) {
    if (y < HEADER_H) {
      if (x < gutterWidth) {
        if (showRowExpand && x < GUTTER_EXPAND_W) return { kind: 'header-expand-all' }
        return { kind: 'header-select-all' }
      }
      const hit = colAtX(x, geom, _scrollLeft)
      if (!hit) return { kind: 'none' }
      return { kind: 'header', col: hit.col, drawnX: hit.drawnX, x, y }
    }
    const bodyY = y + _scrollTop - HEADER_H - insertRowOffset
    const r = rowAtContentY(rowTops, rows.length, ROW_HEIGHT, bodyY)
    if (!r || !r.inRowBody) return { kind: 'none' }
    const idx = r.idx
    if (x < gutterWidth) {
      if (showRowExpand && x < GUTTER_EXPAND_W) return { kind: 'row-expand', idx }
      return { kind: 'row-select', idx }
    }
    const hit = colAtX(x, geom, _scrollLeft)
    if (!hit) return { kind: 'none', idx }
    const actualIdx = _nameToActualIdx.get(hit.col.name) ?? -1
    return { kind: 'cell', idx, col: hit.col, actualIdx, drawnX: hit.drawnX, x, y }
  }

  function onCanvasClick(/** @type {MouseEvent} */ e) {
    if (e.button !== 0) return
    if (_suppressNextClick) { _suppressNextClick = false; return }
    const { x, y } = canvasXY(e)
    const t = hitTest(x, y)
    switch (t.kind) {
      case 'header-expand-all': collapseAllRows(); return
      case 'header-select-all': toggleAll(!allSelected); return
      case 'header': {
        const name = t.col.name
        if (collapsedColumns.has(name)) { restoreColumn(name); return }
        if (resizeColAtX(x, geom, _scrollLeft)) return // resize edge — handled on pointerdown
        handleHeaderSort(name)
        return
      }
      case 'row-expand': toggleRowExpand(/** @type {number} */ (t.idx)); return
      case 'row-select': handleRowSelect(/** @type {number} */ (t.idx), e.shiftKey); return
      case 'cell': {
        const idx = /** @type {number} */ (t.idx)
        const actualIdx = /** @type {number} */ (t.actualIdx)
        if (editingCell) cancelEdit()
        focusedRow = idx
        const vi = actualToVisColIdx(actualIdx)
        if (vi >= 0) focusedCol = vi
        if (e.shiftKey) { openInInspector(idx); return }
        if (inspectorRow !== null) inspectorRow = idx

        const cached = _colCache[actualIdx]
        const value = effectiveCellValue(idx, actualIdx)
        const isNull = value === null || value === undefined
        const isJson = !isNull && typeof value === 'object'
        const canExpand = (cached?.canEdit ?? false) && !cached?.enumValues && !isBooleanType(cached?.colType ?? '')
        const { copy, quick } = cellButtonRects(/** @type {number} */ (t.drawnX), t.col.w, 0, ROW_HEIGHT, { canExpand })
        const relX = x - /** @type {number} */ (t.drawnX)
        if (relX >= copy.x - /** @type {number} */ (t.drawnX) && relX <= copy.x - /** @type {number} */ (t.drawnX) + copy.w) {
          void copyCellValue(idx, actualIdx); return
        }
        if (quick && relX >= quick.x - /** @type {number} */ (t.drawnX) && relX <= quick.x - /** @type {number} */ (t.drawnX) + quick.w) {
          openQuickLook(idx, actualIdx); return
        }
        if (isJson) { openJsonLightbox(value, t.col.name, e); return }
        if (tryFollowForeignKey(idx, actualIdx, e, { requireModifier: true })) return
        // URL cell → open like the old anchor.
        const fk = cached?.fk ?? null
        if (!fk) {
          const href = cellLinkHref(formatCell(value))
          if (href) {
            const ut = cellUrlType(href, t.col.name)
            if (e.ctrlKey || e.metaKey || e.shiftKey) void openExternal(href)
            else if (ut === 'image' || ut === 'pdf') { lightboxUrl = href; lightboxType = /** @type {'image'|'pdf'} */ (ut) }
            else void openExternal(href)
            return
          }
        }
        tableContainer?.focus({ preventScroll: true })
        return
      }
    }
  }

  function onCanvasDblClick(/** @type {MouseEvent} */ e) {
    const { x, y } = canvasXY(e)
    const t = hitTest(x, y)
    if (t.kind !== 'cell') return
    const idx = /** @type {number} */ (t.idx)
    const actualIdx = /** @type {number} */ (t.actualIdx)
    if (tryFollowForeignKey(idx, actualIdx, e)) return
    startEdit(idx, actualIdx)
  }

  function onCanvasAuxClick(/** @type {MouseEvent} */ e) {
    if (e.button !== 1) return
    const { x, y } = canvasXY(e)
    const t = hitTest(x, y)
    if (t.kind === 'cell') tryFollowForeignKey(/** @type {number} */ (t.idx), /** @type {number} */ (t.actualIdx), e)
  }

  function onCanvasPointerDown(/** @type {PointerEvent} */ e) {
    if (e.button !== 0) return
    const { x, y } = canvasXY(e)
    if (y >= HEADER_H) return
    const colName = resizeColAtX(x, geom, _scrollLeft)
    if (!colName) return
    e.preventDefault()
    startColumnResize(colName)
    const startX = e.clientX
    const move = (/** @type {PointerEvent} */ ev) => applyColumnResize(ev.clientX - startX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      endColumnResize()
      // The pointerup is followed by a synthetic click on the canvas; swallow it
      // so a drag that collapsed/resized a column doesn't also sort/restore it.
      _suppressNextClick = true
      setTimeout(() => { _suppressNextClick = false }, 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onCanvasPointerMove(/** @type {PointerEvent} */ e) {
    const { x, y } = canvasXY(e)
    if (resizingColName) return
    if (y < HEADER_H) {
      // Header: resize cursor + hover col for sort affordance.
      const rc = resizeColAtX(x, geom, _scrollLeft)
      _resizeHoverCol = rc
      const hit = x >= gutterWidth ? colAtX(x, geom, _scrollLeft) : null
      hoveredRow = null
      hoveredColName = hit ? hit.col.name : null
      scheduleTooltip(e, hit ? `${hit.col.name}  ·  ${hit.col.dataType}` : null)
      return
    }
    _resizeHoverCol = null
    const t = hitTest(x, y)
    if (t.kind === 'cell') {
      hoveredRow = /** @type {number} */ (t.idx)
      hoveredColName = t.col.name
      const value = effectiveCellValue(/** @type {number} */ (t.idx), /** @type {number} */ (t.actualIdx))
      const cached = _colCache[/** @type {number} */ (t.actualIdx)]
      const fk = cached?.fk ?? null
      let tip = null
      if (fk && value !== null && value !== undefined) {
        tip = `${formatCell(value)} — Ctrl/⌘-click or double-click to open ${foreignKeyTargetLabel(fk)}`
      } else if (!(value !== null && typeof value === 'object')) {
        const full = formatCell(value)
        if (displayCell(value) !== full) tip = full
      }
      scheduleTooltip(e, tip)
    } else {
      hoveredRow = t.kind === 'row-expand' || t.kind === 'row-select' ? /** @type {number} */ (t.idx ?? null) : null
      hoveredColName = null
      scheduleTooltip(e, null)
    }
  }

  function onCanvasPointerLeave() {
    hoveredRow = null
    hoveredColName = null
    _resizeHoverCol = null
    clearTimeout(_tooltipTimer)
    _tooltip = null
  }

  function scheduleTooltip(/** @type {{ clientX: number, clientY: number }} */ e, /** @type {string | null} */ text) {
    clearTimeout(_tooltipTimer)
    if (!text) { _tooltip = null; return }
    const cx = e.clientX, cy = e.clientY
    _tooltipTimer = window.setTimeout(() => {
      const r = tableContainer?.getBoundingClientRect()
      _tooltip = { x: cx - (r?.left ?? 0), y: cy - (r?.top ?? 0), text }
    }, 450)
  }

  /** Right-click: record the target so the single ContextMenu shows the right items. */
  function onCanvasContextMenu(/** @type {MouseEvent} */ e, /** @type {((e: MouseEvent) => void) | undefined} */ bitsOpen) {
    const { x, y } = canvasXY(e)
    const t = hitTest(x, y)
    if (t.kind === 'header') {
      contextIsHeader = true
      contextHeaderCol = t.col.name
      bitsOpen?.(e)
      return
    }
    if (t.kind === 'cell' || t.kind === 'row-select' || t.kind === 'row-expand') {
      contextIsHeader = false
      contextRowIdx = /** @type {number} */ (t.idx)
      contextColIdx = t.kind === 'cell' ? /** @type {number} */ (t.actualIdx) : 0
      pendingContextMenu = true
      bitsOpen?.(e)
      return
    }
    e.preventDefault()
  }

  // Editing-overlay geometry (viewport-relative position of the active cell).
  const editOverlay = $derived.by(() => {
    if (!editingCell) return null
    const col = geom.cols.find((c) => _nameToActualIdx.get(c.name) === editingCell.colIdx)
    if (!col) return null
    const top = HEADER_H + insertRowOffset + (rowTops[editingCell.rowIdx] ?? 0)
    // Pinned columns rest at their frozen x (content-space = scrollLeft + fixed).
    const left = col.pinned
      ? _scrollLeft + (geom.pinnedFixedX.get(col.name) ?? geom.gutterWidth)
      : col.contentX
    return { top, left, width: col.w, height: ROW_HEIGHT }
  })

  onDestroy(() => {
    clearTimeout(_tooltipTimer)
    // Clear staged-edit state in the parent so the StatusBar buttons don't linger.
    pendingEditCount = 0
    applyEdits = () => {}
    resetEdits = () => {}
    scrollToTop = () => {}
    scrollToBottom = () => {}
    beginInsertRow = () => {}
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
    <ContextMenu.Trigger>
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
            (resizingColName || _resizeHoverCol) && "cursor-col-resize",
          )}
          oncontextmenu={(e) => onCanvasContextMenu(e, bitsContextMenu)}
          onscroll={onContainerScroll}
          onkeydown={handleTableKeydown}
          onfocusin={() => { isTableFocused = true; }}
          onfocusout={(e) => {
            if (!tableContainer?.contains(e.relatedTarget instanceof Element ? e.relatedTarget : null)) {
              isTableFocused = false;
            }
          }}
        >
          <!-- Hidden probe: resolves theme CSS custom properties to concrete
               rgb() colours the canvas 2D context can use. -->
          <span
            bind:this={colorProbe}
            aria-hidden="true"
            class="font-mono"
            style="position:absolute;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none"
          ></span>

          {#if visibleColumns.length > 0}
            <!-- Canvas layer: a 0-height sticky wrapper placed BEFORE the sizer
                 so its natural flow position is the top-left; sticky then pins
                 the viewport-sized canvas there while the sizer below provides
                 the scroll range. The canvas overflows the 0-height box. -->
            <div style="position:sticky;top:0;left:0;width:0;height:0;z-index:1;overflow:visible">
              <canvas
                bind:this={canvasEl}
                class="block"
                style="cursor:{resizingColName || _resizeHoverCol ? 'col-resize' : 'default'}"
                onclick={onCanvasClick}
                ondblclick={onCanvasDblClick}
                onauxclick={onCanvasAuxClick}
                onpointerdown={onCanvasPointerDown}
                onpointermove={onCanvasPointerMove}
                onpointerleave={onCanvasPointerLeave}
              ></canvas>
            </div>

            <!-- Sizer: establishes the scroll range; DOM overlays are positioned
                 within it in content coordinates. -->
            <div
              class="relative"
              style="width:{geom.totalWidth}px; height:{contentHeight}px"
            >
              <!-- Inline insert-row form -->
              {#if newRowDrafts}
                <div
                  class="absolute left-0 z-20 flex border-b border-border/30 bg-emerald-500/[0.04] ring-1 ring-inset ring-emerald-500/20"
                  style="top:{HEADER_H}px; height:{ROW_HEIGHT}px; width:{geom.totalWidth}px"
                  onkeydown={onNewRowKeydown}
                >
                  {#if showRowExpand}
                    <div class="flex shrink-0 items-center justify-center border-r border-border/20 bg-primary/5" style="width:{GUTTER_EXPAND_W}px">
                      {#if insertSaving}
                        <Loader class="size-3 animate-spin text-muted-foreground" />
                      {:else}
                        <Check
                          class="size-3 cursor-pointer text-primary hover:text-primary/70"
                          onclick={() => void submitNewRow()}
                          title="Insert row (⌘↵)"
                        />
                      {/if}
                    </div>
                  {/if}
                  {#if showSelection}
                    <div class="flex shrink-0 items-center justify-center border-r border-border/20 bg-primary/5" style="width:{GUTTER_SELECT_W}px">
                      <button
                        type="button"
                        class="inline-flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive"
                        onclick={cancelNewRow}
                        title="Cancel"
                      >
                        <X class="size-3" />
                      </button>
                    </div>
                  {/if}
                  {#each visibleColumns as col (col.name)}
                    {@const dt = col.dataType ?? col.data_type ?? ''}
                    {@const isAuto = isLikelyAutoColumn(dt, col.name, primaryKey)}
                    {@const enumValues = getColumnEnumValues(col)}
                    {@const isBoolean = isBooleanType(dt)}
                    {@const isDateTime = shouldUseDateTimePicker(dt, col.name)}
                    {@const isDateOnly = isDateOnlyType(dt)}
                    {@const isTimeOnly = isTimeOnlyType(dt)}
                    {@const colWidth = widthForColumn(col.name, dt)}
                    <div class="flex shrink-0 items-center overflow-hidden border-r border-border/20 px-2" style="width:{colWidth}px">
                      {#if isAuto}
                        <span class="select-none font-mono text-ui-sm text-muted-foreground/35 italic">auto</span>
                      {:else if enumValues}
                        <select
                          data-new-row-input={col.name}
                          disabled={insertSaving}
                          class="w-full bg-transparent font-mono text-ui-sm text-foreground outline-none disabled:opacity-50"
                          value={newRowDrafts[col.name] ?? ''}
                          onchange={(e) => setNewRowDraft(col.name, e.currentTarget.value)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        >
                          <option value="">{col.nullable ? 'NULL / default' : 'Select…'}</option>
                          {#each enumValues as opt (opt)}<option value={opt}>{opt}</option>{/each}
                        </select>
                      {:else if isBoolean}
                        <select
                          data-new-row-input={col.name}
                          disabled={insertSaving}
                          class="w-full bg-transparent font-mono text-ui-sm text-foreground outline-none disabled:opacity-50"
                          value={newRowDrafts[col.name] ?? ''}
                          onchange={(e) => setNewRowDraft(col.name, e.currentTarget.value)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        >
                          <option value="">{col.nullable ? 'NULL / default' : 'Default'}</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      {:else if isDateTime}
                        <input
                          data-new-row-input={col.name}
                          type="datetime-local"
                          disabled={insertSaving}
                          class="w-full bg-transparent font-mono text-ui-sm text-foreground outline-none placeholder:text-muted-foreground/40 disabled:opacity-50"
                          value={newRowDrafts[col.name] ?? ''}
                          oninput={(e) => setNewRowDraft(col.name, e.currentTarget.value)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        />
                      {:else if isDateOnly}
                        <input
                          data-new-row-input={col.name}
                          type="date"
                          disabled={insertSaving}
                          class="w-full bg-transparent font-mono text-ui-sm text-foreground outline-none disabled:opacity-50"
                          value={newRowDrafts[col.name] ?? ''}
                          oninput={(e) => setNewRowDraft(col.name, e.currentTarget.value)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        />
                      {:else if isTimeOnly}
                        <input
                          data-new-row-input={col.name}
                          type="time"
                          disabled={insertSaving}
                          class="w-full bg-transparent font-mono text-ui-sm text-foreground outline-none disabled:opacity-50"
                          value={newRowDrafts[col.name] ?? ''}
                          oninput={(e) => setNewRowDraft(col.name, e.currentTarget.value)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        />
                      {:else}
                        <input
                          data-new-row-input={col.name}
                          type="text"
                          disabled={insertSaving}
                          placeholder={col.nullable ? 'NULL or value' : 'Required'}
                          class="w-full bg-transparent font-mono text-ui-sm text-foreground outline-none placeholder:text-muted-foreground/40 disabled:opacity-50"
                          value={newRowDrafts[col.name] ?? ''}
                          oninput={(e) => setNewRowDraft(col.name, e.currentTarget.value)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Expanded JSON detail panels -->
              {#each [...expandedRows] as exIdx (exIdx)}
                {#if rows[exIdx]}
                  <div
                    class="absolute z-10 overflow-hidden"
                    style="top:{rowDocTop(exIdx) + ROW_HEIGHT}px; left:{gutterWidth}px; width:{Math.max(geom.totalWidth - gutterWidth, _viewportWidth - gutterWidth)}px; height:{expandHeight}px"
                  >
                    <RowExpandViewer
                      record={rowToRecord(columns, rows[exIdx])}
                      rowLabel={"row " + (exIdx + 1)}
                      maxHeight={expandHeight + "px"}
                    />
                  </div>
                {/if}
              {/each}

              <!-- Active inline cell editor -->
              {#if editingCell && editOverlay}
                {@const ecol = columns[editingCell.colIdx]}
                {@const ecached = _colCache[editingCell.colIdx]}
                {@const eEnum = ecached?.enumValues ?? null}
                {@const eType = ecached?.colType ?? ''}
                {@const eNullable = ecol?.nullable ?? true}
                <div
                  class="absolute z-30 box-border bg-background ring-2 ring-inset ring-primary"
                  style="top:{editOverlay.top}px; left:{editOverlay.left}px; width:{editOverlay.width}px; height:{editOverlay.height}px"
                >
                  {#if eEnum}
                    <select
                      bind:this={editInput}
                      bind:value={editingCell.draft}
                      disabled={saving}
                      aria-label="Edit {ecol?.name ?? 'cell'}"
                      class="box-border block h-full w-full min-w-0 max-w-full cursor-pointer appearance-none border-0 bg-transparent px-3 font-mono text-ui-sm text-foreground outline-none"
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={handleEditKeydown}
                      onchange={() => void commitEdit()}
                    >
                      {#if eNullable}<option value="">NULL</option>{/if}
                      {#if editingCell.original && !eEnum.includes(editingCell.original)}
                        <option value={editingCell.original}>{editingCell.original}</option>
                      {/if}
                      {#each eEnum as option (option)}<option value={option}>{option}</option>{/each}
                    </select>
                  {:else if isBooleanType(eType)}
                    {@const isOn = editingCell.draft === "true"}
                    {@const isNull = eNullable && editingCell.draft !== "true" && editingCell.draft !== "false"}
                    <button
                      type="button"
                      bind:this={editInput}
                      disabled={saving}
                      aria-label="Toggle {ecol?.name ?? 'cell'}"
                      class="flex h-full w-full items-center gap-2.5 px-3 font-mono text-ui-sm text-foreground outline-none"
                      onclick={async (e) => {
                        e.stopPropagation();
                        editingCell.draft = editingCell.draft === "true" ? "false" : "true";
                        await commitEdit();
                      }}
                      onkeydown={handleEditKeydown}
                    >
                      <span class={cn("relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150", isOn ? "bg-primary/80" : "bg-muted-foreground/30")}>
                        <span class="absolute size-3 rounded-full bg-white shadow-sm transition-transform duration-150" style={isOn ? "transform: translateX(14px)" : "transform: translateX(2px)"}></span>
                      </span>
                      <span class={isNull ? "text-muted-foreground" : ""}>{isNull ? "NULL" : editingCell.draft === "true" ? "true" : "false"}</span>
                    </button>
                  {:else}
                    <input
                      bind:this={editInput}
                      bind:value={editingCell.draft}
                      disabled={saving}
                      aria-label="Edit {ecol?.name ?? 'cell'}"
                      class="box-border block h-full w-full min-w-0 max-w-full overflow-x-auto border-0 bg-transparent px-3 font-mono text-ui-sm text-foreground outline-none [field-sizing:fixed] selection:bg-primary/20"
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={handleEditKeydown}
                    />
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Empty states -->
          {#if visibleColumns.length === 0}
            <div class="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center" role="status" aria-live="polite">
              <div class="flex flex-col items-center gap-2 px-4 text-center">
                <Table2 class="size-8 text-muted-foreground/25" />
                <p class="text-ui-sm text-muted-foreground">No columns visible</p>
              </div>
            </div>
          {:else if rows.length === 0 && !newRowDrafts}
            <div class="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center" role="status" aria-live="polite">
              <div class="flex flex-col items-center gap-2 px-4 text-center">
                <Table2 class="size-8 text-muted-foreground/25" />
                <p class="text-ui-sm text-muted-foreground">No rows in this table</p>
              </div>
            </div>
          {/if}

          <!-- Hover tooltip (restores title= affordances lost to canvas) -->
          {#if _tooltip}
            <div
              class="pointer-events-none absolute z-40 max-w-md truncate rounded border border-border bg-popover px-2 py-1 font-mono text-ui-2xs text-popover-foreground shadow-md"
              style="left:{Math.min(_tooltip.x + 12, (_viewportWidth - 12))}px; top:{_tooltip.y + 18}px"
            >{_tooltip.text}</div>
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
      {#if contextIsHeader}
        {@const hcol = contextHeaderCol}
        {@const hSorted = rowSort?.column === hcol}
        {@const hAsc = hSorted && rowSort?.direction === 'asc'}
        {@const hDesc = hSorted && rowSort?.direction === 'desc'}
        {@const hPinned = pinnedColumns.has(hcol)}
        {@const hCollapsed = collapsedColumns.has(hcol)}
        <ContextMenu.Item onSelect={() => runMenuAction(() => headerSortDirect(hcol, 'asc'))}>
          <ArrowUp />
          Sort ascending
          {#if hAsc}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => runMenuAction(() => headerSortDirect(hcol, 'desc'))}>
          <ArrowDown />
          Sort descending
          {#if hDesc}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
        </ContextMenu.Item>
        {#if hSorted}
          <ContextMenu.Item onSelect={() => runMenuAction(() => { if (pendingEdits.size > 0) { toast.error('Unsaved changes', { description: 'Apply or reset your edits before sorting.' }); return } onsortchange(null) })}>
            <ArrowUpDown />
            Clear sort
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => runMenuAction(() => onfiltercolumn(hcol))}>
          <ListFilter />
          Filter by this column
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => runMenuAction(() => toggleColumnPin(hcol))}>
          {#if hPinned}<PinOff />Unpin column{:else}<Pin />Pin column{/if}
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => runMenuAction(() => onhidecolumn(hcol))}>
          <EyeOff />
          Hide column
        </ContextMenu.Item>
        {#if hCollapsed}
          <ContextMenu.Item onSelect={() => runMenuAction(() => restoreColumn(hcol))}>
            <ArrowUpDown />
            Restore column
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => runMenuAction(() => resetColumnWidth(hcol))}>
          <RotateCcw />
          Reset column width
        </ContextMenu.Item>
      {:else}
        <ContextMenu.Item onSelect={() => runMenuAction(() => openInInspector(contextRowIdx))}>
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
        <ContextMenu.Item onSelect={() => runMenuAction(() => toggleColumnPin(menuColName))}>
          {#if menuColPinned}<PinOff />Unpin column{:else}<Pin />Pin column{/if}
        </ContextMenu.Item>
        {#if menuColCollapsed}
          <ContextMenu.Item onSelect={() => runMenuAction(() => restoreColumn(menuColName))}>
            <ArrowUpDown />
            Restore column
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item
          disabled={!menuEditable || readonly}
          onSelect={() => runMenuAction(() => startEdit(contextRowIdx, contextColIdx))}
        >
          <Pencil />
          Edit
          <ContextMenu.Shortcut>Enter</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => runMenuAction(() => copyCellValue(contextRowIdx, contextColIdx))}>
          <Copy />
          Copy
          <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Item
          disabled={!menuEditable || menuCellNull || readonly}
          onSelect={() => runMenuAction(() => setCellNull(contextRowIdx, contextColIdx))}
        >
          <CircleSlash />
          Set NULL
        </ContextMenu.Item>
        {#if showRowExpand}
          <ContextMenu.Item onSelect={() => runMenuAction(() => toggleRowExpand(contextRowIdx))}>
            <Braces />
            {isRowExpanded(contextRowIdx) ? "Collapse row JSON" : "Expand"}
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
        <ContextMenu.Item onSelect={() => runMenuAction(() => toggleRow(contextRowIdx))}>
          <CheckSquare />
          {selected.has(contextRowIdx) ? "Deselect row" : "Select row"}
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item
          variant="destructive"
          disabled={!hasPrimaryKey || saving || readonly}
          onSelect={() => runMenuAction(() => deleteRow(contextRowIdx))}
        >
          <Trash2 />
          {selected.size > 1 && selected.has(contextRowIdx)
            ? `Delete ${formatCompactCount(selected.size)} rows`
            : "Delete row"}
          <ContextMenu.Shortcut>⌘⌫</ContextMenu.Shortcut>
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Root>
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

