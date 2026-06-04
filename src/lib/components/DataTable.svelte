<script>
  import { tick, onDestroy, untrack } from "svelte";
  import {
    zoomState, adjustZoom, resetZoom, ZOOM_STEP,
  } from '$lib/stores/canvas-zoom.svelte.js'

  // Local derived so all $derived layout constants track it reactively.
  const canvasZoom = $derived(zoomState.value)
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
  import FkSubviewPanel from "./FkSubviewPanel.svelte";
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
    /**
     * Reverse FK relationships (tables that reference this table).
     * Rendered as virtual badge columns at the right.
     * @type {Array<{ fromSchema:string, fromTable:string, fromColumns:string[], toColumns:string[], constraintName:string }>}
     */
    incomingForeignKeys = [],
    /** Fetch related rows for an inline FK sub-view. Returns { columns, rows, error? }. */
    onfetchrelatedrows = /** @type {(detail: any) => Promise<{ columns: any[], rows: any[], error?: string }>} */ (async () => ({ columns: [], rows: [] })),
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

  /**
   * Currently open FK sub-view (forward or reverse), or null.
   * @type {{ rowIdx:number, kind:'forward'|'reverse', label:string, data:{ loading:boolean, columns:any[], rows:any[], error:string|null } } | null}
   */
  let fkSubview = $state(null)

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


  // ── Canvas zoom ────────────────────────────────────────────────────────────
  // canvasZoom / adjustZoom / resetZoom come from the shared store so ALL open
  // DataTable tabs zoom together and the level persists across sessions.

  // All layout constants scale with canvasZoom so the entire canvas zooms together.
  const ROW_HEIGHT = $derived(Math.round(36 * canvasZoom))

  let _scrollTop = $state(0)
  // Start high so the first paint covers any reasonable screen height before the
  // ResizeObserver fires with the real value.
  let _viewportHeight = $state(1200)

  // ── Canvas rendering ──────────────────────────────────────────────────────
  const HEADER_H = $derived(Math.round(40 * canvasZoom))
  const GUTTER_EXPAND_W = $derived(Math.round(38 * canvasZoom))
  const GUTTER_SELECT_W = $derived(Math.round(42 * canvasZoom))
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
  /** Measured heights for each expanded row (rowIdx → px). Updated by ResizeObserver. */
  let expandedRowHeights = $state(/** @type {Map<number, number>} */ (new Map()))

  /**
   * Svelte action: observes an expand panel's rendered height and updates the map.
   * Cleans up when the panel unmounts (row collapsed).
   * @param {HTMLElement} node
   * @param {number} rowIdx
   */
  function trackExpandHeight(node, rowIdx) {
    // Debounce height updates so rapid changes (toolbar → loaded content) collapse
    // into a single reactive write, avoiding a double layout-shift.
    let timer = 0
    const commit = () => {
      const h = node.offsetHeight
      // Ignore tiny heights that just reflect the loading/toolbar-only state —
      // keep the current allocation until real content settles.
      if (h >= 48 && expandedRowHeights.get(rowIdx) !== h) {
        expandedRowHeights = new Map(expandedRowHeights).set(rowIdx, h)
      }
    }
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(commit, 40) })
    ro.observe(node)
    return {
      destroy() {
        clearTimeout(timer)
        ro.disconnect()
        const next = new Map(expandedRowHeights)
        next.delete(rowIdx)
        expandedRowHeights = next
      },
    }
  }

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

    // Tab / Enter: move right between cells (not down to the next row).
    // Shift+Tab moves left. Enter at the last cell submits.
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const editableCols = visibleColumns.filter(c => {
        const dt = c.dataType ?? c.data_type ?? ''
        return !isLikelyAutoColumn(dt, c.name, primaryKey)
      })
      if (!editableCols.length) return
      const curIdx = editableCols.findIndex(c => c.name === newRowFocusCol)
      if (e.shiftKey) {
        const prev = curIdx <= 0 ? editableCols.length - 1 : curIdx - 1
        newRowFocusCol = editableCols[prev].name
      } else {
        const next = curIdx + 1
        if (next >= editableCols.length) {
          if (e.key === 'Enter') void submitNewRow()
          else newRowFocusCol = editableCols[0].name  // Tab wraps to first
        } else {
          newRowFocusCol = editableCols[next].name
        }
      }
    }
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
    if (next.has(rowIdx)) {
      next.delete(rowIdx);
    } else {
      next.add(rowIdx);
      // Opening JSON expand: close FK sub-view for the same row (mutually exclusive)
      if (fkSubview?.rowIdx === rowIdx) fkSubview = null
    }
    expandedRows = next;
  }

  /** Collapse every expanded row at once. */
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

  // ── Virtual relationship columns (reverse FK / one-to-many) ─────────────────
  // One per unique fromTable, max 8. Shown as badge columns to the right of real data.
  const MAX_VIRTUAL_COLS = 5
  // Width adapts to the longest label (7px/char estimate + padding), clamped 110–180px
  const VIRTUAL_COL_W = $derived.by(() => {
    if (!virtualRelCols.length) return Math.round(300 * canvasZoom)
    const maxChars = Math.max(...virtualRelCols.map(v => v.label.length))
    const base = Math.min(380, Math.max(300, maxChars * 10 + 60))
    return Math.round(base * canvasZoom)
  })
  const virtualRelCols = $derived.by(() => {
    if (!incomingForeignKeys.length) return /** @type {typeof incomingForeignKeys} */ ([])
    const seen = new Set()
    const result = []
    for (const fk of incomingForeignKeys) {
      if (seen.has(fk.fromTable)) continue
      seen.add(fk.fromTable)
      result.push({ ...fk, label: (fk.fromSchema && fk.fromSchema !== schema) ? `${fk.fromSchema}.${fk.fromTable}` : fk.fromTable })
      if (result.length >= MAX_VIRTUAL_COLS) break
    }
    return result
  })
  // Total scrollable width includes virtual rel columns
  const totalContentWidth = $derived(geom.totalWidth + virtualRelCols.length * VIRTUAL_COL_W)

  // +1 for the trailing auto-width spacer column (keeps real columns stable).
  const dataColSpan = $derived(visibleColumns.length + 1);
  const totalColSpan = $derived(
    (showRowExpand ? 1 : 0) + (showSelection ? 1 : 0) + visibleColumns.length + 1,
  )
  const navigableColumns = $derived(visibleColumns)
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
  // FK sub-view is a zero-cost overlay — it does NOT push rows down and is NOT
  // included in rowTops. This eliminates the fkSubviewHeight→_mergedHeights→rowTops
  // reactive chain that caused lag every time the panel opened or changed height.
  const rowTops = $derived(computeRowTops(rows.length, expandedRows, 320, ROW_HEIGHT, expandedRowHeights))
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
    // Only reset vertical scroll — preserve horizontal position so the user
    // stays looking at the same columns after a sort or filter reload.
    untrack(() => {
      _scrollTop = 0
      if (tableContainer && tableContainer.scrollTop !== 0) tableContainer.scrollTop = 0
      fkSubview = null
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
  /** Returns the display width of a column in canvas px (logical × canvasZoom). */
  function widthForColumn(name, dataType) {
    const logical = columnWidths[name] ?? defaultColumnWidth(dataType)
    return Math.round(logical * canvasZoom)
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
    // dx is screen pixels; convert to logical (un-zoomed) before clamping
    _pendingResizeWidth = clampColumnWidth(resizeStartWidth + Math.round(dx / canvasZoom))
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
      if (columnWidthsKey) saveColumnWidths(columnWidthsKey, columnWidths);
    }
    resizingColName = null;
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

  /** Reset a column's width to its default. */
  function resetColumnWidth(colName) {
    const col = columns.find((c) => c.name === colName)
    const dt = col?.dataType ?? col?.data_type ?? ''
    columnWidths = { ...columnWidths, [colName]: clampColumnWidth(defaultColumnWidth(dt)) }
    if (columnWidthsKey) saveColumnWidths(columnWidthsKey, columnWidths)
  }

  // ── Per-tab expand/sub-view state preservation ───────────────────────────────
  // Expand rows and FK sub-view are saved per columnWidthsKey so switching tabs
  // restores exactly what the user had open in each table.
  /** @type {Map<string, { expandedRows: Set<number>, fkSubview: typeof fkSubview }>} */
  const _tabExpandCache = new Map()
  let _lastTabKey = columnWidthsKey ?? ''

  $effect(() => {
    const newKey = columnWidthsKey ?? ''
    if (newKey === _lastTabKey) return
    untrack(() => {
      // Save state for the tab we're leaving
      if (_lastTabKey !== undefined && _lastTabKey !== '') {
        _tabExpandCache.set(_lastTabKey, {
          expandedRows: new Set(expandedRows),
          fkSubview: fkSubview,
        })
      }
      // Restore state for the tab we're entering (fresh Set/null if first visit)
      const saved = _tabExpandCache.get(newKey)
      expandedRows = saved ? new Set(saved.expandedRows) : new Set()
      fkSubview = saved?.fkSubview ?? null
      // Always reset non-content states
      focusedRow = null
      focusedCol = null
      pastEdits = []
      futureEdits = []
      _lastTabKey = newKey
    })
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

  // Dedicated zoom watcher — runs the moment zoomState.value changes in any tab,
  // clears the font cache so they're re-measured at the new size, and bumps
  // _redrawToken to guarantee a full canvas repaint immediately.
  $effect(() => {
    const z = zoomState.value  // subscribe to the store directly
    untrack(() => {
      _fonts = null            // discard cached font metrics — zoom may change them
      _redrawToken++
    })
  })

  // The focused-cell highlight is painted directly on the canvas by draw(),
  // which depends on focusedRow/focusedCol and so repaints on focus changes.

  /** @param {KeyboardEvent} e */
  function handleTableKeydown(e) {
    // Ctrl/Cmd + / - / 0: zoom the canvas table
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      if (e.key === '=' || e.key === '+') { e.preventDefault(); adjustZoom(ZOOM_STEP); return }
      if (e.key === '-')                  { e.preventDefault(); adjustZoom(-ZOOM_STEP); return }
      if (e.key === '0')                  { e.preventDefault(); resetZoom(); return }
    }

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
        // Priority: close FK sub-view first, then clear cell focus
        if (fkSubview !== null) { fkSubview = null; break; }
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
  const CELL_PAD_X = $derived(Math.round(16 * canvasZoom))
  const ICON_HIT = $derived(Math.round(24 * canvasZoom))

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
    const right = cellX + w - 4  // 4px right margin
    const cy = ry + rh / 2
    const copy = { x: right - ICON_HIT, y: ry, w: ICON_HIT, h: rh, cx: right - ICON_HIT / 2, cy }
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

    // Scale fonts for the current zoom level.
    // We temporarily swap _fonts so all drawing helpers pick up the right sizes
    // without needing extra parameters.
    const _baseFonts = _fonts
    if (canvasZoom !== 1.0 && _baseFonts) {
      const cpx = Math.max(8, Math.round(_baseFonts.cellPx * canvasZoom))
      const tpx = Math.max(7, Math.round(_baseFonts.typePx * canvasZoom))
      _fonts = {
        family: _baseFonts.family,
        cellPx: cpx,
        typePx: tpx,
        cell:   `${cpx}px ${_baseFonts.family}`,
        type:   `${tpx}px ${_baseFonts.family}`,
        header: `530 ${cpx}px ${_baseFonts.family}`,
      }
    }

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

    // Restore base fonts (the zoom-scaled copy was only for this draw pass).
    _fonts = _baseFonts
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawBodyRow(ctx, idx, ry, c) {
    const rh = ROW_HEIGHT
    // Row background — selected uses primary tint, others use muted.
    const isSel = selected.has(idx)
    if (isSel) {
      ctx.fillStyle = withAlpha(c.cPrimary, hoveredRow === idx ? 0.18 : 0.13)
      ctx.fillRect(0, ry, c.usedW, rh)
    } else if (focusedRow === idx) {
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.22)
      ctx.fillRect(0, ry, c.usedW, rh)
    } else if (hoveredRow === idx) {
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.18)
      ctx.fillRect(0, ry, c.usedW, rh)
    }

    // Non-pinned cells.
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx + col.w <= 0 || dx >= _viewportWidth) continue
      drawCell(ctx, idx, col, dx, ry, rh, c)
    }

    // Pinned cells on top (frozen left).
    for (const col of geom.cols) {
      if (!col.pinned) continue
      const dx = colDrawnX(col, geom, _scrollLeft)
      drawCell(ctx, idx, col, dx, ry, rh, c, true)
    }

    // Gutters scroll with content — drawn on top to cover any cell bleed.
    drawRowGutters(ctx, idx, -_scrollLeft, ry, rh, c)

    // Row ring when focused + selected.
    if (focusedRow === idx && isSel) {
      ctx.strokeStyle = withAlpha(c.cPrimary, 0.45)
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, ry + 0.5, c.usedW - 1, rh - 1)
    }

    // ── Virtual relationship column cells ─────────────────────────────────────
    // Drawn BEFORE the bottom grid line so the line renders on top of cell fills.
    for (let vi = 0; vi < virtualRelCols.length; vi++) {
      const vc = virtualRelCols[vi]
      const cellX = geom.totalWidth + vi * VIRTUAL_COL_W - _scrollLeft
      if (cellX + VIRTUAL_COL_W <= 0 || cellX >= _viewportWidth) continue
      ctx.fillStyle = c.cPanel; ctx.fillRect(cellX, ry, VIRTUAL_COL_W, rh)
      const isActive = fkSubview?.rowIdx === idx && fkSubview?.kind === 'reverse' && fkSubview?.label === vc.label
      const isVHov = hoveredRow === idx && hoveredColName === `__vrel__${vi}`
      if (!_fonts) return

      // Badge font: 1px smaller than cell text for a compact chip feel
      const badgeFontPx = Math.max(10, _fonts.cellPx - 1)
      const bPadX = 9
      const bH = Math.round(badgeFontPx * 1.65)
      const bR = bH / 2
      ctx.font = `500 ${badgeFontPx}px ${_fonts.family}`

      const maxLabelW = VIRTUAL_COL_W - 28
      const labelTxt = truncText(ctx, vc.label, maxLabelW)
      const textW = ctx.measureText(labelTxt).width
      const bW = textW + bPadX * 2
      const bX = cellX + (VIRTUAL_COL_W - bW) / 2
      const bY = ry + (rh - bH) / 2

      if (isActive) { ctx.fillStyle = withAlpha(c.cPrimary, 0.06); ctx.fillRect(cellX, ry, VIRTUAL_COL_W, rh) }

      ctx.fillStyle = isActive
        ? withAlpha(c.cPrimary, 0.14)
        : isVHov ? withAlpha(c.cMutedBg, 0.5) : withAlpha(c.cMutedBg, 0.28)
      roundRect(ctx, bX, bY, bW, bH, bR); ctx.fill()

      ctx.strokeStyle = isActive ? withAlpha(c.cPrimary, 0.5) : withAlpha(c.cMuted, 0.3)
      ctx.lineWidth = 1
      roundRect(ctx, bX + 0.5, bY + 0.5, bW - 1, bH - 1, bR); ctx.stroke()

      ctx.fillStyle = isActive ? c.cPrimary : withAlpha(c.cFg, 0.7)
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
      ctx.fillText(labelTxt, bX + bW / 2, ry + rh / 2 + 0.5)

      // Right column border (vertical)
      ctx.strokeStyle = c.cGrid; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cellX + VIRTUAL_COL_W - 0.5, ry); ctx.lineTo(cellX + VIRTUAL_COL_W - 0.5, ry + rh); ctx.stroke()
    }

    // Bottom grid line — drawn LAST so it sits on top of all cell fills (real + virtual).
    ctx.strokeStyle = c.cGrid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, ry + rh - 0.5)
    ctx.lineTo(_viewportWidth, ry + rh - 0.5)
    ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawCell(ctx, idx, col, cellX, ry, rh, c, pinned = false) {
    const w = col.w

    const actualIdx = _nameToActualIdx.get(col.name) ?? -1
    const cached = _colCache[actualIdx]

    if (pinned) {
      ctx.fillStyle = c.cPanel
      ctx.fillRect(cellX, ry, w, rh)
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
      else if (isFocusedCell) { ctx.fillStyle = withAlpha(c.cPrimary, 0.08); ctx.fillRect(cellX, ry, w, rh) }
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
    const rowHover = hoveredRow === idx
    const isHover = rowHover && hoveredColName === col.name
    const canExpand = (cached?.canEdit ?? false) && !cached?.enumValues && !isBooleanType(cached?.colType ?? '')

    // Right-side content widths (sequential, no overlap).
    const hoverW = isHover ? ICON_HIT + (canExpand ? ICON_HIT : 0) : 0
    const fkW = (activeFk && rowHover) ? 20 : 0
    const jsonW = isJson ? 36 : 0
    const rightReserve = 4 + hoverW + fkW + jsonW  // 4 = right margin
    const textMaxW = w - CELL_PAD_X * 2 - rightReserve

    ctx.font = _fonts.cell
    ctx.fillStyle = textColor
    ctx.textAlign = 'left'
    ctx.fillText(truncText(ctx, text, Math.max(0, textMaxW)), cellX + CELL_PAD_X, ry + rh / 2 + 0.5)

    // Draw right-side items right-to-left with a running cursor.
    const cy = ry + rh / 2
    let rx = cellX + w - 4  // 4px right margin

    // 1. Hover buttons (rightmost when hovering the cell).
    if (isHover) {
      drawIcon(ctx, 'copy', rx - ICON_HIT + 5, cy - 7, 14, c.cMuted, 1.8)
      rx -= ICON_HIT
      if (canExpand) {
        drawIcon(ctx, 'maximize-2', rx - ICON_HIT + 5, cy - 7, 14, c.cMuted, 1.8)
        rx -= ICON_HIT
      }
    }

    // 2. FK external-link icon (row hover only).
    if (activeFk && rowHover) {
      drawIcon(ctx, 'external-link', rx - 16, cy - 6, 12, withAlpha(c.cRing, 0.9), 2)
      rx -= 20
    }

    // 3. JSON pill.
    if (isJson) {
      const pillW = 30, pillH = 13
      const px = rx - 2 - pillW
      const py = ry + (rh - pillH) / 2
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.5)
      roundRect(ctx, px, py, pillW, pillH, 2.5); ctx.fill()
      ctx.fillStyle = c.cMuted
      ctx.font = `600 9px ${_fonts.family}`
      ctx.textAlign = 'left'
      ctx.fillText('JSON', px + 8, py + pillH / 2 + 0.5)
      drawIcon(ctx, 'braces', px + 1.5, py + 2.5, 8, c.cMuted, 2.2)
    }

    // Focused-cell outline — bright primary border.
    if (isFocusedCell) {
      ctx.strokeStyle = withAlpha(c.cPrimary, 0.85)
      ctx.lineWidth = 2
      ctx.strokeRect(cellX + 1, ry + 1, w - 2, rh - 2)
    }
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} offsetX scroll-adjusted left offset */
  function drawRowGutters(ctx, idx, offsetX, ry, rh, c) {
    if (gutterWidth <= 0) return
    ctx.fillStyle = c.cPanel
    ctx.fillRect(offsetX, ry, gutterWidth, rh)
    let gx = offsetX
    if (showRowExpand) {
      const expanded = expandedRows.has(idx) || fkSubview?.rowIdx === idx
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
    ctx.strokeStyle = c.cGrid
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(offsetX + gutterWidth - 0.5, ry); ctx.lineTo(offsetX + gutterWidth - 0.5, ry + rh); ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawHeaderRow(ctx, c) {
    ctx.fillStyle = c.cPanel
    ctx.fillRect(0, 0, c.W, HEADER_H)

    // Non-pinned headers.
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx + col.w <= 0 || dx >= c.W) continue
      drawHeaderCell(ctx, col, dx, c)
    }

    // Pinned headers.
    for (const col of geom.cols) {
      if (!col.pinned) continue
      drawHeaderCell(ctx, col, colDrawnX(col, geom, _scrollLeft), c)
    }

    // Gutter headers — scroll with content.
    if (gutterWidth > 0) {
      const gx0 = -_scrollLeft
      ctx.fillStyle = c.cPanel
      ctx.fillRect(gx0, 0, gutterWidth, HEADER_H)
      let gx = gx0
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
      ctx.beginPath(); ctx.moveTo(gx0 + gutterWidth - 0.5, 0); ctx.lineTo(gx0 + gutterWidth - 0.5, HEADER_H); ctx.stroke()
    }

    // Virtual relationship column headers
    for (let vi = 0; vi < virtualRelCols.length; vi++) {
      const vc = virtualRelCols[vi]
      const x = geom.totalWidth + vi * VIRTUAL_COL_W - _scrollLeft
      if (x + VIRTUAL_COL_W <= 0 || x >= c.W) continue
      if (vi === 0) {
        ctx.fillStyle = withAlpha(c.cMutedBg, 0.1); ctx.fillRect(x, 0, VIRTUAL_COL_W, HEADER_H)
        ctx.strokeStyle = withAlpha(c.cPrimary, 0.25); ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x + 1, 4); ctx.lineTo(x + 1, HEADER_H - 4); ctx.stroke()
      }
      ctx.strokeStyle = c.cGrid; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + VIRTUAL_COL_W - 0.5, 0); ctx.lineTo(x + VIRTUAL_COL_W - 0.5, HEADER_H); ctx.stroke()
      if (!_fonts) continue
      ctx.font = _fonts.header; ctx.fillStyle = withAlpha(c.cMuted, 0.6)
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      // Use smaller side padding (8px) so long names fit more fully
      ctx.fillText(truncText(ctx, vc.label, VIRTUAL_COL_W - 16), x + 8, HEADER_H / 2 + 0.5)
    }

    // Header bottom border.
    ctx.strokeStyle = c.cBorder
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, HEADER_H - 0.5); ctx.lineTo(c.W, HEADER_H - 0.5); ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawHeaderCell(ctx, col, x, c) {
    const w = col.w

    const sorted = rowSort?.column === col.name

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

    // Inline datatype with separator dot — only if there's comfortable room.
    const typeGap = badges.length ? 5 : 3
    const typeStartX = tx + typeGap
    const typeRoom = x + w - sortReserve - 4 - typeStartX
    if (typeRoom > 28 && col.dataType) {
      ctx.font = _fonts.type
      ctx.fillStyle = withAlpha(c.cMuted, 0.3)
      ctx.fillText('·', typeStartX, cy + 0.5)
      const dotW = ctx.measureText('· ').width
      ctx.fillStyle = withAlpha(c.cMuted, 0.7)
      ctx.fillText(truncText(ctx, col.dataType, typeRoom - dotW), typeStartX + dotW, cy + 0.5)
    }

    // Sort indicator — Lucide icons.
    if (sorted) {
      const iconName = rowSort?.direction === 'asc' ? 'arrow-up' : 'arrow-down'
      drawIcon(ctx, iconName, x + w - sortReserve + 2, cy - 7, 14, withAlpha(c.cPrimary, 0.9), 1.8)
    } else if (_resizeHoverCol !== col.name && hoveredColName === col.name && hoveredRow === null) {
      drawIcon(ctx, 'arrow-up-down', x + w - sortReserve + 2, cy - 7, 14, withAlpha(c.cMuted, 0.4), 1.6)
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
    void rows; void columns; void columnWidths
    void pinnedColumns; void hiddenColumns; void selected; void focusedRow
    void focusedCol; void editingCell; void pendingEdits; void expandedRows
    void rowSort; void _scrollTop; void _scrollLeft; void _viewportWidth
    void _viewportHeight; void hoveredRow; void hoveredColName; void _resizeHoverCol
    void resizingColName; void newRowDrafts; void insertSaving; void colMeta
    void geom; void rowTops; void _redrawToken; void foreignKeys; void indexes
    void _colCache; void expandedRowHeights; void fkSubview; void virtualRelCols; void VIRTUAL_COL_W
    // Read the zoom store directly so this effect re-runs the moment any tab changes zoom.
    void zoomState.value; void canvasZoom

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
    // Content x accounts for scroll — gutters live in content space, not frozen.
    const cx = x + _scrollLeft
    if (y < HEADER_H) {
      if (cx < gutterWidth) {
        if (showRowExpand && cx < GUTTER_EXPAND_W) return { kind: 'header-expand-all' }
        return { kind: 'header-select-all' }
      }
      const hit = colAtX(x, geom, _scrollLeft, 0)
      if (!hit) return { kind: 'none' }
      return { kind: 'header', col: hit.col, drawnX: hit.drawnX, x, y }
    }
    const bodyY = y + _scrollTop - HEADER_H - insertRowOffset
    const r = rowAtContentY(rowTops, rows.length, ROW_HEIGHT, bodyY)
    if (!r || !r.inRowBody) return { kind: 'none' }
    const idx = r.idx
    if (cx < gutterWidth) {
      if (showRowExpand && cx < GUTTER_EXPAND_W) return { kind: 'row-expand', idx }
      return { kind: 'row-select', idx }
    }
    const hit = colAtX(x, geom, _scrollLeft, 0)
    if (!hit) return { kind: 'none', idx }
    const actualIdx = _nameToActualIdx.get(hit.col.name) ?? -1
    return { kind: 'cell', idx, col: hit.col, actualIdx, drawnX: hit.drawnX, x, y }
  }

  function onCanvasClick(/** @type {MouseEvent} */ e) {
    if (e.button !== 0) return
    if (_suppressNextClick) { _suppressNextClick = false; return }
    const { x, y } = canvasXY(e)

    // Check virtual relationship column clicks (right of real columns)
    if (y >= HEADER_H && virtualRelCols.length > 0) {
      const cx = x + _scrollLeft
      const vOffset = cx - geom.totalWidth
      if (vOffset >= 0) {
        const vi = Math.floor(vOffset / VIRTUAL_COL_W)
        if (vi >= 0 && vi < virtualRelCols.length) {
          const vc = virtualRelCols[vi]
          const bodyY = y + _scrollTop - HEADER_H - insertRowOffset
          const r = rowAtContentY(rowTops, rows.length, ROW_HEIGHT, bodyY)
          if (!r?.inRowBody) return
          const rowIdx = r.idx
          const row = rows[rowIdx] ?? []
          // Toggle: same cell closes
          if (fkSubview?.rowIdx === rowIdx && fkSubview?.kind === 'reverse' && fkSubview?.label === vc.label) {
            fkSubview = null
            return
          }
          // Opening FK sub-view: close JSON expand for the same row (mutually exclusive)
          if (expandedRows.has(rowIdx)) { const s = new Set(expandedRows); s.delete(rowIdx); expandedRows = s }
          fkSubview = { rowIdx, kind: 'reverse', label: vc.label, relInfo: vc, data: { loading: true, columns: [], rows: [], error: null } }
          scrollRowIntoView(rowIdx)
          void onfetchrelatedrows({ kind: 'reverse', fromSchema: vc.fromSchema, fromTable: vc.fromTable, fromColumns: vc.fromColumns, toColumns: vc.toColumns, row }).then(res => {
            if (fkSubview?.rowIdx !== rowIdx || fkSubview?.label !== vc.label) return
            fkSubview = { ...fkSubview, data: { loading: false, columns: res.columns ?? [], rows: res.rows ?? [], error: res.error ?? null } }
          })
          return
        }
      }
    }

    const t = hitTest(x, y)
    switch (t.kind) {
      case 'header-expand-all': collapseAllRows(); return
      case 'header-select-all': toggleAll(!allSelected); return
      case 'header': {
        if (resizeColAtX(x, geom, _scrollLeft, 5, 0)) return // resize edge — handled on pointerdown
        handleHeaderSort(t.col.name)
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

        // Forward FK: Ctrl/Cmd = full navigation; plain click = inline sub-view
        const fk = cached?.fk ?? null
        if (fk && !isNull) {
          if (e.metaKey || e.ctrlKey) {
            tryFollowForeignKey(idx, actualIdx, e)
            return
          }
          const fkLbl = foreignKeyTargetLabel(fk)
          if (fkSubview?.rowIdx === idx && fkSubview?.kind === 'forward' && fkSubview?.label === fkLbl) {
            fkSubview = null
            return
          }
          // Opening FK sub-view: close JSON expand for the same row (mutually exclusive)
          if (expandedRows.has(idx)) { const s = new Set(expandedRows); s.delete(idx); expandedRows = s }
          fkSubview = { rowIdx: idx, kind: 'forward', label: fkLbl, colIdx: actualIdx, data: { loading: true, columns: [], rows: [], error: null } }
          scrollRowIntoView(idx)
          void onfetchrelatedrows({ kind: 'forward', fk, row: rows[idx] ?? [] }).then(res => {
            if (fkSubview?.rowIdx !== idx || fkSubview?.label !== fkLbl) return
            fkSubview = { ...fkSubview, data: { loading: false, columns: res.columns ?? [], rows: res.rows ?? [], error: res.error ?? null } }
          })
          tableContainer?.focus({ preventScroll: true })
          return
        }

        // URL cell → open like the old anchor.
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
    const colName = resizeColAtX(x, geom, _scrollLeft, 5, 0)
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
      const rc = resizeColAtX(x, geom, _scrollLeft, 5, 0)
      _resizeHoverCol = rc
      const cx = x + _scrollLeft
      const hit = cx >= gutterWidth ? colAtX(x, geom, _scrollLeft, 0) : null
      hoveredRow = null
      hoveredColName = hit ? hit.col.name : null
      return
    }
    _resizeHoverCol = null
    // Check virtual rel columns first (they are to the right of real columns)
    if (y >= HEADER_H && virtualRelCols.length > 0) {
      const cx = x + _scrollLeft
      const vOffset = cx - geom.totalWidth
      if (vOffset >= 0) {
        const vi = Math.floor(vOffset / VIRTUAL_COL_W)
        if (vi >= 0 && vi < virtualRelCols.length) {
          const bodyY = y + _scrollTop - HEADER_H - insertRowOffset
          const r = rowAtContentY(rowTops, rows.length, ROW_HEIGHT, bodyY)
          if (r?.inRowBody) { hoveredRow = r.idx; hoveredColName = `__vrel__${vi}` }
          return
        }
      }
    }
    const t = hitTest(x, y)
    if (t.kind === 'cell') {
      hoveredRow = /** @type {number} */ (t.idx)
      hoveredColName = t.col.name
    } else {
      hoveredRow = t.kind === 'row-expand' || t.kind === 'row-select' ? /** @type {number} */ (t.idx ?? null) : null
      hoveredColName = null
    }
  }

  /** Right-click: record the target so the single ContextMenu shows the right items. */
  function onCanvasPointerLeave() {
    hoveredRow = null
    hoveredColName = null
    _resizeHoverCol = null
  }

  // Ctrl/Cmd+Scroll → zoom the canvas. Must use { passive: false } so preventDefault
  // works — Svelte's onwheel directive registers a passive listener by default which
  // can't call preventDefault, causing the browser to intercept the event first.
  $effect(() => {
    const el = tableContainer
    if (!el) return
    function onWheel(/** @type {WheelEvent} */ e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      adjustZoom(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

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
          onwheel={(e) => {
            // Without Shift: treat all wheel events as vertical.
            // Horizontal table scroll only when Shift is explicitly held.
            // This prevents trackpad horizontal-bias from hijacking page scroll.
            if (!e.shiftKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
              // Vertical-dominant scroll without Shift — let it bubble up to
              // the parent (AI chat / page scroll) and prevent the table from
              // consuming it as horizontal scroll.
              const tc = tableContainer
              if (!tc) return
              const atTop = tc.scrollTop === 0
              const atBottom = tc.scrollTop + tc.clientHeight >= tc.scrollHeight - 1
              if (e.deltaY < 0 && atTop || e.deltaY > 0 && atBottom) {
                // Already at the vertical limit — let the outer container scroll
                return
              }
              // Otherwise scroll this container vertically (the default behavior)
              // and stop horizontal scrolling.
              e.preventDefault()
              tc.scrollTop += e.deltaY
            } else if (e.shiftKey) {
              // Shift+scroll: horizontal scrolling within the table
              e.preventDefault()
              const tc = tableContainer
              if (tc) tc.scrollLeft += e.deltaY || e.deltaX
            }
            // Pure horizontal gesture (deltaX dominant, no shift) — allow native
          }}
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
              style="width:{totalContentWidth}px; height:{contentHeight}px"
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

              <!-- JSON expand panels (independent from FK sub-view) -->
              {#each [...expandedRows] as exIdx (exIdx)}
                {#if rows[exIdx] !== undefined}
                  <div
                    class="absolute z-10"
                    style="top:{rowDocTop(exIdx) + ROW_HEIGHT}px; left:{gutterWidth}px; width:{Math.max(geom.totalWidth - gutterWidth, _viewportWidth - gutterWidth)}px"
                    use:trackExpandHeight={exIdx}
                  >
                    <RowExpandViewer record={rowToRecord(columns, rows[exIdx])} rowLabel={"row " + (exIdx + 1)} />
                  </div>
                {/if}
              {/each}

              <!-- FK sub-view panel — spans full viewport width (including gutter area).
                   Only horizontal wheel events are stopped so the main table can still
                   scroll vertically when the pointer is over the sub-view. -->
              {#if fkSubview !== null && rows[fkSubview.rowIdx] !== undefined}
                {@const fkIdx = fkSubview.rowIdx}
                <div
                  class="absolute z-20"
                  style="top:{rowDocTop(fkIdx) + ROW_HEIGHT}px; left:0; width:{_viewportWidth}px; transform:translateX({_scrollLeft}px); will-change:transform"
                  onwheel={(e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.stopPropagation() }}
                >
                  <FkSubviewPanel
                    data={fkSubview.data}
                    fkLabel={fkSubview.label}
                    onclose={() => { fkSubview = null }}
                    onfullview={() => {
                      const sv = fkSubview
                      if (!sv) return
                      if (sv.kind === 'reverse' && sv.relInfo) {
                        // Reverse FK: navigate to fromTable with filter
                        onfollowforeignkey({ rowIdx: fkIdx, colIdx: 0, reverseRel: sv.relInfo, row: rows[fkIdx] })
                      } else {
                        // Forward FK: navigate to referenced table via normal FK nav
                        onfollowforeignkey({ rowIdx: fkIdx, colIdx: sv.colIdx ?? 0 })
                      }
                    }}
                  />
                </div>
              {/if}

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

