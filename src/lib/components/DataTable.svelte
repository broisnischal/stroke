<script>
  import { tick, onDestroy, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { zoomState } from '$lib/stores/canvas-zoom.svelte.js'
  // Zoom is driven through the app-level settings so the canvas scales together
  // with the rest of the UI (applySettings mirrors the app zoom into zoomState).
  import { increaseZoom, decreaseZoom, resetZoom, appPreviewDml, appTableStyle, TABLE_STYLES, normalizeTableStyle } from '$lib/stores/settings.js'
  import { toast } from "$lib/components/ui/sonner/toast.svelte.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import ListFilter from "@lucide/svelte/icons/list-filter";
import FilterX from "@lucide/svelte/icons/filter-x";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Link2 from "@lucide/svelte/icons/link-2";
  import Zap from "@lucide/svelte/icons/zap";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";
  import Circle from "@lucide/svelte/icons/circle";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronsDownUp from "@lucide/svelte/icons/chevrons-down-up";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronsLeft from "@lucide/svelte/icons/chevrons-left";
  import ChevronsRight from "@lucide/svelte/icons/chevrons-right";
  import Palette from "@lucide/svelte/icons/palette";
  import Tag from "@lucide/svelte/icons/tag";
  import Ban from "@lucide/svelte/icons/ban";
  import Copy from "@lucide/svelte/icons/copy";
  import CopyPlus from "@lucide/svelte/icons/copy-plus";
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
    oversizeCellInfo,
    oversizeCellText,
    formatByteSize,
  } from "$lib/cell-value.js";
  import {
    defaultInsertDraft,
    shouldUseDateTimePicker,
    nowDateTimeLocal,
    nowDateOnly,
    nowTimeOnly,
  } from "$lib/insert-field.js";
  import { cellLinkHref, cellUrlType } from "$lib/cell-display.js";
  import {
    buildUpdateStatements,
    buildDeleteStatements,
    buildInsertStatements,
  } from "$lib/dml-preview.js";
  import { formatSql } from "$lib/format-sql.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import ShikiBlock from "./ShikiBlock.svelte";
  import {
    savePendingChanges,
    loadPendingChanges,
    clearPendingChanges,
  } from "$lib/stores/pending-table-edits.js";
  import { formatCellValue, transformsFor, transformById, enabledGenerators, linkifyValue, statsNeeded, annotatorEnabled, anyDisplayExtEnabled } from "$lib/plugins/registry.js";
  import { pluginState } from "$lib/stores/plugins.js";
  import Wand2 from "@lucide/svelte/icons/wand-2";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import MediaLightbox from "./MediaLightbox.svelte";
  import RowExpandViewer from "./RowExpandViewer.svelte";
  import ArrayCellEditor from "./ArrayCellEditor.svelte";
  import FkSubviewPanel from "./FkSubviewPanel.svelte";
  // JsonCellLightbox (Monaco-based) is imported lazily at its render site below.
  import CellQuickLook from "./CellQuickLook.svelte";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import Check from "@lucide/svelte/icons/check";
  import Loader from "@lucide/svelte/icons/loader";
  import X from "@lucide/svelte/icons/x";
  import DateTimePicker from "./DateTimePicker.svelte";
  import ColumnStatsPanel from "./ColumnStatsPanel.svelte";
  import BarChart2 from "@lucide/svelte/icons/bar-chart-2";
  import VirtualColumnsPanel from "./VirtualColumnsPanel.svelte";
  import { virtualColumnsStore } from "$lib/stores/virtual-columns.js";
  import { bindExpr, looksLikeUrl } from "$lib/virtual-column.js";
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
    computeRowTops,
    rowAtContentY,
    rowIndexAtY,
  } from "$lib/canvas-table.js";

  // Local derived so all $derived layout constants track it reactively.
  const canvasZoom = $derived(zoomState.value)

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
    /** Engine family — drives identifier quoting in the DML preview. */
    dialect = /** @type {import('$lib/dml-preview.js').Dialect} */ ('postgres'),
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
    /** Secondary sort keys (multi-column sort); primary is rowSort. @type {{ column: string, direction: 'asc' | 'desc' }[]} */
    rowSortMore = [],
    /** Called on header sort. Emits the full ordered key list ([] clears). */
    onsortchange = /** @type {(sorts: { column: string, direction: 'asc' | 'desc' }[]) => void} */ (() => {}),
    /** Number of staged (unsaved) cell edits. Bindable so the StatusBar can show Apply/Reset. */
    pendingEditCount = $bindable(0),
    /** Assigned by this component; the parent calls these to flush / discard staged edits. */
    applyEdits = $bindable(/** @type {() => void | Promise<void>} */ (() => {})),
    resetEdits = $bindable(/** @type {() => void} */ (() => {})),
    /** Assigned by this component; the parent (StatusBar) calls these to jump the
     *  table to the top / bottom. */
    scrollToTop = $bindable(/** @type {() => void} */ (() => {})),
    scrollToBottom = $bindable(/** @type {() => void} */ (() => {})),
    /** Assigned by this component; the parent (StatusBar) calls these to jump the
     *  table to the far left / right when it scrolls horizontally. */
    scrollToLeft = $bindable(/** @type {() => void} */ (() => {})),
    scrollToRight = $bindable(/** @type {() => void} */ (() => {})),
    /** Bindable: true when the grid content is wider than the viewport (so the
     *  parent can show the horizontal go-to-edge controls). */
    canScrollHorizontally = $bindable(false),
    /** Assigned by this component; the parent (toolbar "Jump to column" menu)
     *  calls focusColumn(name) to scroll a column into view and briefly
     *  highlight it. */
    focusColumn = $bindable(/** @type {(name: string) => void} */ (() => {})),
    /** Assigned by this component so the parent can persist/restore scroll per
     *  tab. getScroll() reads the live position; applyScroll() restores it once
     *  layout settles. */
    getScroll = $bindable(/** @type {() => { left: number, top: number }} */ (() => ({ left: 0, top: 0 }))),
    applyScroll = $bindable(/** @type {(pos: { left?: number, top?: number }) => void} */ (() => {})),
    /** Called when user picks "Filter by this column" from the column header context menu. */
    onfiltercolumn = /** @type {(colName: string) => void} */ (() => {}),
    /** Called when user right-clicks a cell and picks "Filter by value" or "Exclude value". */
    onfilterbyvalue = /** @type {(colName: string, value: unknown, exclude?: boolean) => void} */ (() => {}),
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
    /**
     * Execute raw SQL the user hand-edited in the DML preview, then refetch. Only
     * invoked when the previewed SQL was actually changed — the unedited path still
     * runs through the structured per-cell writes (`onsave`/`ondelete`/`oninsertrow`).
     * @type {(sql: string) => Promise<void>}
     */
    onexecutesql = /** @type {(sql: string) => Promise<void>} */ (async () => {}),
    /** True while the insert is in flight — disables the draft row inputs. */
    insertSaving = false,
    /** Assigned by this component so the parent can trigger beginInsertRow(). */
    beginInsertRow = $bindable(/** @type {() => void} */ (() => {})),
    /** Assigned by this component so the parent (⌘⌫ / toolbar) can stage the
     *  selected rows for deletion instead of deleting them immediately. */
    stageDeleteSelected = $bindable(/** @type {() => void} */ (() => {})),
    /** When true all write operations (edit, delete, insert) are disabled. */
    readonly = false,
    /** Bindable: controls whether the virtual columns management panel is open. */
    vcolPanelOpen = $bindable(false),
    /** Incremented by the parent when a fresh page of rows is applied
     *  (page/filter/sort/search change). On change the table jumps its scroll
     *  and virtual window back to the top. */
    reloadToken = 0,
    /** Infinite scroll mode — when true the table fires onloadmore near the bottom. */
    infiniteScroll = false,
    /** True while an incremental "load more" fetch is in flight. */
    loadingMore = false,
    /** Called when the user scrolls near the bottom in infinite scroll mode. */
    onloadmore = /** @type {() => void} */ (() => {}),
    /** True when every row has been loaded in infinite scroll mode (no more pages). */
    endOfResults = false,
    /** Active row-search query (toolbar search). Matched substrings are
     *  highlighted in the drawn cell text. */
    searchQuery = '',
  } = $props();

  /**
   * Staged cell edits not yet written to the database, keyed by "rowIdx:colIdx".
   * The cell shows the staged value (marked dirty) until the user clicks Apply.
   * @type {Map<string, { rowIdx: number, colIdx: number, value: unknown, original: unknown }>}
   */
  // Restore any changes staged for this table before the component last unmounted
  // (switching to a SQL/AI tab, or another table tab, tears DataTable down).
  const _restoredPending = untrack(() => loadPendingChanges(columnWidthsKey ?? ''));

  // Stable table key for persistence. `columnWidthsKey` derives from the parent's
  // `activeTable`, which is nulled during teardown when switching to a SQL/AI tab —
  // so reading it in onDestroy would lose the key. Track the last non-empty value.
  let _persistKey = untrack(() => columnWidthsKey ?? '');
  $effect(() => { if (columnWidthsKey) _persistKey = columnWidthsKey; });

  let pendingEdits = $state(_restoredPending.edits);
  /** Cheap gate so per-cell staged-edit lookups are skipped entirely when there
   *  are no unsaved edits (the common case) — avoids a string alloc + Map.get
   *  on every cell of large tables. */
  const hasPendingEdits = $derived(pendingEdits.size > 0);

  /**
   * Row indices staged for deletion — shown with a red diff marker until Apply.
   * Kept separate from `pendingEdits` so a row can be edited then deleted, and
   * so the gutter/row rendering can distinguish the two.
   * @type {Set<number>}
   */
  let pendingDeletes = $state(_restoredPending.deletes);
  const hasPendingDeletes = $derived(pendingDeletes.size > 0);
  /** Any unsaved change (edit or delete) — drives the tab/close guards. */
  const hasPendingChanges = $derived(pendingEdits.size > 0 || pendingDeletes.size > 0);

  /**
   * DML preview / confirm dialog. Non-null while open. Every write path (apply
   * staged edits, insert a new row, delete rows) routes through this so the user
   * can review the exact SQL before it runs. `run` performs the actual write.
   * @type {{ kind: 'update' | 'insert' | 'delete', title: string, description: string, statements: string[], confirmLabel: string, destructive: boolean, run: () => Promise<void> } | null}
   */
  let dmlPreview = $state(null);
  /** True while the confirmed write is in flight. */
  let dmlPreviewRunning = $state(false);
  /** Prettified SQL shown in the (editable) preview editor. Bound to the editor. */
  let dmlEditedSql = $state("");
  /** The pristine prettified SQL, to detect whether the user edited it. */
  let dmlOriginalSql = $state("");
  /** True once the user has changed the previewed SQL — switches Apply to raw exec. */
  const dmlWasEdited = $derived(dmlEditedSql.trim() !== dmlOriginalSql.trim());

  /** @type {import('$lib/dml-preview.js').DmlContext} */
  const dmlContext = $derived({ dialect, schema, table: tableName, columns, primaryKey });

  /**
   * Route a write through the confirm dialog, or run it straight away when the
   * "Preview SQL before applying" setting is off.
   * @param {NonNullable<typeof dmlPreview>} config
   */
  function requestWrite(config) {
    if ($appPreviewDml) {
      dmlPreview = config;
      // Prettify the generated statements for a readable, editable preview.
      dmlOriginalSql = formatSql(config.statements.join("\n"));
      dmlEditedSql = dmlOriginalSql;
    } else {
      void config.run();
    }
  }

  /** Run the previewed write, then close the dialog. */
  async function confirmDmlPreview() {
    if (!dmlPreview || dmlPreviewRunning) return;
    dmlPreviewRunning = true;
    try {
      if (dmlWasEdited) {
        // The user hand-edited the SQL — run it verbatim (as raw statements) and
        // refetch. Arbitrary edits can't be mapped back to the staged per-cell
        // model, so drop all staged edits/deletes and the inline insert draft.
        await onexecutesql(dmlEditedSql.trim());
        pendingEdits = new Map();
        pendingDeletes = new Set();
        pastEdits = [];
        futureEdits = [];
        savePendingChanges(_persistKey, pendingEdits, pendingDeletes);
        cancelNewRow();
      } else {
        await dmlPreview.run();
      }
      dmlPreview = null;
    } finally {
      dmlPreviewRunning = false;
    }
  }

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

  // ── Related-rows dock (bottom panel) ────────────────────────────────────────
  // The FK sub-view renders docked below the scroll container — a fixed-height
  // drawer with its own internal scroll — instead of inline between rows (which
  // made grid scrolling fight the panel). Height is user-resizable + persisted.
  const FK_DOCK_MIN = 120, FK_DOCK_MAX = 600
  let fkDockHeight = $state((() => {
    try {
      const n = Number(localStorage.getItem('stroke:fk-dock-height'))
      if (Number.isFinite(n) && n >= FK_DOCK_MIN && n <= FK_DOCK_MAX) return n
    } catch {}
    return 260
  })())
  /** @param {PointerEvent} e */
  function startFkDockResize(e) {
    e.preventDefault()
    const startY = e.clientY, startH = fkDockHeight
    const move = (/** @type {PointerEvent} */ ev) => {
      fkDockHeight = Math.min(FK_DOCK_MAX, Math.max(FK_DOCK_MIN, startH + (startY - ev.clientY)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { localStorage.setItem('stroke:fk-dock-height', String(fkDockHeight)) } catch {}
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Column whose quick-stats panel is open, or null. */
  let statsCol = $state(/** @type {string | null} */ (null))

  /**
   * True when the grid shows a real table (schema/table known). Ad-hoc result
   * sets (SQL console, embedded AI results) have no table identity, so actions
   * that query or mutate the source table — column stats, filter by value/
   * column, edit, duplicate, delete — are hidden.
   */
  const hasTableContext = $derived(!!tableName)

  let contextRowIdx = $state(0);
  let contextColIdx = $state(0);
  let contextMenuOpen = $state(false);

  // Array cell editor (Prisma-style add/remove for SQL array columns).
  let arrayEditorOpen = $state(false);
  let arrayEditorRow = $state(0);
  let arrayEditorCol = $state(0);
  let arrayEditorColName = $state("");
  let arrayEditorType = $state("");
  let arrayEditorValue = $state(/** @type {any[]} */ ([]));
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

  // ── Virtual expression columns ───────────────────────────────────────────────
  /** Per-id logical widths (un-zoomed px) for virtual expr cols. */
  let _vexprWidths = $state(/** @type {Record<string,number>} */ ({}));

  // ── Keyboard navigation / undo ────────────────────────────────────────────
  /** Visible-column index of the focused cell (null = no cell focus). */
  let focusedCol = $state(/** @type {number | null} */ (null));
  /** Column name briefly highlighted after the user picks it from the toolbar's
   *  "Jump to column" menu (header + body band). null = no highlight. */
  let focusColName = $state(/** @type {string | null} */ (null));
  /** Column names selected via click / shift+click on column headers. */
  let selectedCols = $state(/** @type {Set<string>} */ (new Set()));
  /** Anchor column for shift+click range selection (plain var — not reactive). */
  let _lastHeaderClickedCol = /** @type {string | null} */ (null);

  /**
   * Rectangular cell-range selection (spreadsheet-style). The fixed corner is
   * `selAnchor`; the moving corner is `focusedRow`/`focusedCol` (visible-column
   * space). null = plain single-cell focus. Extended via Shift+Arrow or drag.
   * @type {{ row: number, col: number } | null}
   */
  let selAnchor = $state(null);
  /** True while a click-drag range selection is in progress. */
  let _rangeDragging = false;
  /** Pointer-down cell + position, to distinguish a click from a drag-select. */
  let _rangeDownCell = /** @type {{ row: number, col: number, x: number, y: number } | null} */ (null);

  /**
   * The active rectangular range in visible-column space, or null for a single
   * cell. A plain function (not $derived) because the canvas draw() reads it from
   * the rAF loop — outside any reactive context — where reading a $derived would
   * trip Svelte's `derived_inert` warning and return stale values. It only reads
   * $state (safe to read anywhere) and stays in sync automatically.
   * @returns {{ r0: number, r1: number, c0: number, c1: number } | null}
   */
  function computeCellRange() {
    if (selAnchor === null || focusedRow === null || focusedCol === null) return null;
    const r0 = Math.min(selAnchor.row, focusedRow);
    const r1 = Math.max(selAnchor.row, focusedRow);
    const c0 = Math.min(selAnchor.col, focusedCol);
    const c1 = Math.max(selAnchor.col, focusedCol);
    if (r0 === r1 && c0 === c1) return null; // collapsed to one cell
    return { r0, r1, c0, c1 };
  }

  /** Extend column selection from anchor to `toColName`, using geom.cols order. */
  function extendColSelection(toColName) {
    if (!_lastHeaderClickedCol) { selectedCols = new Set([toColName]); _lastHeaderClickedCol = toColName; return }
    const startIdx = geom.cols.findIndex((c) => c.name === _lastHeaderClickedCol)
    const endIdx   = geom.cols.findIndex((c) => c.name === toColName)
    if (startIdx < 0 || endIdx < 0) return
    const [lo, hi] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)]
    selectedCols = new Set(geom.cols.slice(lo, hi + 1).map((c) => c.name))
  }
  /** @type {ReturnType<typeof setTimeout> | null} */
  let _focusColTimer = null;
  /** Scrollable container element for programmatic focus + scroll. */
  let tableContainer = $state(/** @type {HTMLDivElement | null} */ (null));
  /** Whether to select-all text when the edit input is focused. */
  let selectOnEditFocus = $state(true);
  /** Whether the enum cell-editor dropdown is open (auto-opens on edit). */
  let enumEditorOpen = $state(false);
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
  // canvasZoom mirrors the app zoom: applySettings() writes the app zoom into the
  // shared zoomState store, so all open tabs zoom together with the rest of the UI
  // and the level persists via app settings.

  // All layout constants scale with canvasZoom so the entire canvas zooms together.
  const ROW_HEIGHT = $derived(Math.round(24 * canvasZoom))

  let _scrollTop = $state(0)
  // Start high so the first paint covers any reasonable screen height before the
  // ResizeObserver fires with the real value.
  let _viewportHeight = $state(1200)

  // ── Canvas rendering ──────────────────────────────────────────────────────
  const HEADER_H = $derived(Math.round(30 * canvasZoom))
  const GUTTER_EXPAND_W = $derived(Math.round(32 * canvasZoom))
  const GUTTER_SELECT_W = $derived(Math.round(36 * canvasZoom))
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
  /** Synchronous wheel-zoom guard — updated in pointer handlers so the wheel
   *  listener never reads stale $state through a closed-over $effect closure. */
  const _zoomGuard = { block: false, resizing: false }
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
      if (h >= 40 && expandedRowHeights.get(rowIdx) !== h) {
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
    void prefetchJsonLightbox() // ensure the chunk is loading even if hover didn't warm it
    jsonLightbox = { value, colName }
  }

  // The JSON lightbox loads Monaco lazily (kept out of startup memory). To avoid a
  // first-open jank — importing/parsing the ~4MB Monaco chunk + creating the editor
  // on the main thread while the canvas is mid-interaction — we warm the module the
  // moment the pointer hovers a JSON cell, a beat before the click actually opens it.
  let _lightboxWarmed = false
  function prefetchJsonLightbox() {
    if (_lightboxWarmed) return
    _lightboxWarmed = true
    return import('./JsonCellLightbox.svelte')
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
      const { toast } = await import("$lib/components/ui/sonner/toast.svelte.js");
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
  // Truncated cells only hold a preview — filtering on it would build wrong SQL.
  const menuCellOversize = $derived(!!oversizeCellInfo(rows[contextRowIdx]?.[contextColIdx]));
  // SQL array column? (value already decoded to a JS array, or type ends with []).
  const menuColType = $derived(
    String(columns[contextColIdx]?.dataType ?? columns[contextColIdx]?.data_type ?? _colCache[contextColIdx]?.colType ?? ""),
  );
  // The dedicated array editor writes a Postgres array literal ({a,b}) cast to the
  // real array type — that's native to PostgreSQL & CockroachDB (Neon/Supabase/
  // Prisma all speak the pg wire protocol, so they route through the same path).
  // Other engines either have no native arrays (MySQL/SQLite/MSSQL) or use a
  // different literal (ClickHouse/DuckDB [..]), so restrict the editor to pg-family
  // to avoid producing a write the backend can't apply.
  const isPgArrayDialect = $derived(dialect === "postgres" || dialect === "cockroachdb");
  const menuCellIsArray = $derived(
    isPgArrayDialect &&
      (Array.isArray(rows[contextRowIdx]?.[contextColIdx]) || /\[\]\s*$/.test(menuColType)),
  );
  // Extension-provided transforms applicable to the right-clicked cell.
  const menuTransforms = $derived.by(() => {
    void $pluginState;
    const v = rows[contextRowIdx]?.[contextColIdx];
    if (v === null || v === undefined) return [];
    return transformsFor(v, _colCache[contextColIdx]?.colType ?? "", menuColName);
  });
  // Value generators (UUIDv7, nanoid, …) offered when the cell is editable.
  const menuGenerators = $derived.by(() => {
    void $pluginState;
    return enabledGenerators();
  });
  // Transforms offered for a whole column (header menu), decided from a sample
  // of the column's first non-null value.
  const menuColTransforms = $derived.by(() => {
    void $pluginState;
    const name = contextHeaderCol;
    if (!name) return [];
    const actualIdx = _nameToActualIdx.get(name) ?? -1;
    if (actualIdx < 0) return [];
    let sample = null;
    for (let i = 0; i < rows.length && i < 200; i++) {
      const v = rows[i]?.[actualIdx];
      if (v !== null && v !== undefined) { sample = v; break }
    }
    if (sample === null) return [];
    return transformsFor(sample, _colCache[actualIdx]?.colType ?? "", name);
  });

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
      // Oversize sentinels carry a preview instead of the real (multi-MB)
      // value — render the truncation marker + head, not the sentinel wrapper.
      const over = oversizeCellInfo(value);
      // JSON/JSONB objects and arrays render as JSON here. SQL *array columns* get
      // the pgAdmin {a,b} form instead, but that decision needs the column type, so
      // it lives in drawCell (arrayDisplay) — a jsonb array must stay ["a","b"].
      const s = over ? oversizeCellText(over) : JSON.stringify(value);
      _formatCache.set(value, s);
      return s;
    }
    return String(value);
  }

  // Render a JS array as a Postgres array literal for display: {a,b}, {} for
  // empty, NULL for null elements. Elements are quoted only when they contain a
  // delimiter/quote/brace/whitespace or would be ambiguous — matching pgAdmin.
  function pgArrayElem(el) {
    if (el === null || el === undefined) return "NULL";
    // Nested arrays (multi-dim) recurse; objects (e.g. json[]) fall back to JSON.
    if (Array.isArray(el)) return pgArrayText(el);
    if (typeof el === "object") return JSON.stringify(el);
    const s = String(el);
    if (s === "" || /[",{}\\\s]/.test(s) || /^null$/i.test(s)) {
      return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    return s;
  }
  function pgArrayText(arr) {
    return "{" + arr.map(pgArrayElem).join(",") + "}";
  }
  // Cached pgAdmin-style display for SQL *array columns* only (drawCell passes the
  // value after confirming the column type ends with []). Cached per value object
  // so the scroll hot path never rebuilds the string. jsonb arrays never reach
  // this — they render as ["a","b"] via formatCell.
  /** @type {WeakMap<object, string>} */
  const _arrayDisplayCache = new WeakMap();
  function arrayDisplay(arr) {
    const hit = _arrayDisplayCache.get(arr);
    if (hit !== undefined) return hit;
    const s = pgArrayText(arr);
    _arrayDisplayCache.set(arr, s);
    return s;
  }
  /** True when a column's SQL type is an array (ends with []). */
  function isSqlArrayType(colType) {
    return /\[\]\s*$/.test(colType ?? "");
  }

  /** Truncated version for DOM rendering — keeps long values out of the render tree */
  function displayCell(value) {
    const s = formatCell(value);
    return s.length > CELL_DISPLAY_LIMIT ? s.slice(0, CELL_DISPLAY_LIMIT) + "…" : s;
  }

  // Per-row display-string cache for the draw hot path. Keyed on the row ARRAY:
  // every write path replaces the row array immutably (handleSaveCell maps a new
  // array, batch apply + DML refetch replace the whole page), so stale entries
  // are impossible and GC reclaims them with the rows. Kills the String(value)
  // allocation per primitive cell per frame while scrolling. Staged edits bypass
  // this cache entirely (their value differs from the row's).
  /** @type {WeakMap<unknown[], string[]>} */
  const _cellTextCache = new WeakMap();
  function cellDisplayText(/** @type {unknown[]} */ row, /** @type {number} */ actualIdx, /** @type {unknown} */ value) {
    let arr = _cellTextCache.get(row);
    if (!arr) { arr = []; _cellTextCache.set(row, arr); }
    const hit = arr[actualIdx];
    if (hit !== undefined) return hit;
    const s = displayCell(value);
    arr[actualIdx] = s;
    return s;
  }

  // Same idea for virtual expression columns — the bound evaluator runs per cell
  // per FRAME otherwise (string building on every scroll frame). The entry keeps
  // the fns identity so a changed expression set invalidates naturally.
  /** @type {WeakMap<unknown[], { fns: unknown, texts: string[] }>} */
  const _vexprTextCache = new WeakMap();
  function vexprText(/** @type {unknown[]} */ row, /** @type {number} */ fnIdx) {
    let e = _vexprTextCache.get(row);
    if (!e || e.fns !== _vcolFns) { e = { fns: _vcolFns, texts: [] }; _vexprTextCache.set(row, e); }
    let s = e.texts[fnIdx];
    if (s === undefined) {
      const fn = _vcolFns[fnIdx];
      s = fn ? fn(row) : '';
      e.texts[fnIdx] = s;
    }
    return s;
  }

  // Whether any formatter/linkifier is enabled — gates the per-cell directive
  // lookup so the scroll hot path does zero extension work in the common case.
  const _extActive = $derived.by(() => { void $pluginState; return anyDisplayExtEnabled(); });

  // Repaint when extension settings or column stats change — both affect drawn
  // cell text, badges, tints, and the header annotator strip.
  $effect(() => { void $pluginState; void _colStats; scheduleDraw(); });

  // Resolved canvas-grid style preset (Settings → Appearance). Read once per frame
  // by draw() and passed into the row context, so it never adds per-cell reactivity.
  const _tableStyle = $derived(TABLE_STYLES[normalizeTableStyle($appTableStyle)]);
  // Repaint the grid the moment the user switches preset.
  $effect(() => { void $appTableStyle; scheduleDraw(); });

  // ── Search-match highlighting ──────────────────────────────────────────────
  // The toolbar search filters rows server-side (ILIKE, case-insensitive);
  // this paints where each match falls inside the visible cell text. Matching
  // runs only while a search is active, on the already-truncated display
  // string, so the scroll hot path stays free of extra work otherwise.
  const _searchLower = $derived(String(searchQuery ?? '').trim().toLowerCase());
  $effect(() => { void _searchLower; scheduleDraw(); });

  const MAX_CELL_MATCH_HIGHLIGHTS = 8;
  /**
   * @param {CanvasRenderingContext2D} ctx @param {string} drawn
   * @param {number} textX @param {number} ry @param {number} rh @param {any} c
   */
  function drawSearchHighlights(ctx, drawn, textX, ry, rh, c) {
    const q = _searchLower;
    const hay = drawn.toLowerCase();
    let from = 0, n = 0;
    const hh = Math.min(rh - 4, Math.round(17 * canvasZoom));
    const hy = ry + (rh - hh) / 2;
    ctx.fillStyle = withAlpha(c.AMBER, 0.3);
    while (n < MAX_CELL_MATCH_HIGHLIGHTS) {
      const at = hay.indexOf(q, from);
      if (at === -1) break;
      const x0 = textX + (at > 0 ? ctx.measureText(drawn.slice(0, at)).width : 0);
      const mw = ctx.measureText(drawn.slice(at, at + q.length)).width;
      roundRect(ctx, x0 - 1, hy, mw + 2, hh, 3);
      ctx.fill();
      from = at + q.length;
      n++;
    }
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

  /**
   * Scroll a visible column into view (if it's off-screen) and briefly highlight
   * it. Pinned columns are always visible, so they only get the highlight.
   * @param {string} name
   */
  function focusColumnByName(name) {
    const col = geom.cols.find((c) => c.name === name)
    if (!col) return
    if (tableContainer && !col.pinned) {
      // Left edge of the scrollable area is occluded by the frozen pinned cols.
      const frozen = geom.frozenWidth
      const PAD = 28
      const vLeft = col.contentX - _scrollLeft
      const vRight = vLeft + col.w
      let target = _scrollLeft
      if (vLeft < frozen + PAD) {
        target = col.contentX - frozen - PAD
      } else if (vRight > _viewportWidth - PAD) {
        target = col.contentX + col.w - _viewportWidth + PAD
      }
      target = Math.max(0, target)
      if (Math.abs(target - _scrollLeft) > 1) {
        tableContainer.scrollTo({ left: target, behavior: "smooth" })
      }
    }
    focusColName = name
    if (_focusColTimer) clearTimeout(_focusColTimer)
    _focusColTimer = setTimeout(() => {
      focusColName = null
      _focusColTimer = null
      scheduleDraw()
    }, 2200)
    scheduleDraw()
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
        // ClickHouse is OLAP: rows aren't primary-key addressable, so the backend
        // reports no PK on purpose. Say why and point to the supported path rather
        // than the misleading generic "no primary key" message.
        description: dialect === "clickhouse"
          ? "ClickHouse tables are browse-only here — modify data with ALTER TABLE … UPDATE in the SQL console."
          : "This table has no primary key.",
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
    const oversize = oversizeCellInfo(startValue);
    if (oversize) {
      // Only a truncated preview was loaded — editing would write it back.
      toast.error("Value too large to edit", {
        description: `${col.name} holds ${formatByteSize(oversize.bytes)}; edit it with a SQL UPDATE instead.`,
      });
      return;
    }
    lastEditOriginalValue = startValue;
    selectOnEditFocus = initialChar === undefined;
    const original = valueToEditString(startValue);
    editingCell = {
      rowIdx,
      colIdx,
      draft: initialChar !== undefined ? initialChar : original,
      original,
    };
    // Enum columns edit via a dropdown — open it immediately so a single
    // interaction (double-click / Enter) reveals the choices.
    enumEditorOpen = !!getColumnEnumValues(col);
  }

  function cancelEdit() {
    if (!editingCell) return;
    editingCell = null;
    enumEditorOpen = false;
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
    const oversize = oversizeCellInfo(startValue);
    if (oversize) {
      // Only a truncated preview was loaded — the quick-look editor would
      // silently save it back. The JSON lightbox covers read-only viewing.
      toast.error("Value too large to edit", {
        description: `${col.name} holds ${formatByteSize(oversize.bytes)}; edit it with a SQL UPDATE instead.`,
      });
      return;
    }
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
      try { const sa = JSON.stringify(a); return sa === JSON.stringify(b); } catch { return false; }
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
      toast.error("Could not save", { description: String(err) });
    }
  }

  /**
   * Validated values for the inline new-row draft, if the user has typed anything
   * into it and it passes validation; otherwise null. Lets the combined "Review
   * changes" flow include the pending INSERT instead of silently dropping it.
   * @returns {Record<string, unknown> | null}
   */
  function pendingInsertValues() {
    if (!newRowDrafts) return null;
    const hasAny = Object.values(newRowDrafts).some((v) => v !== "" && v != null);
    if (!hasAny) return null;
    const editableCols = columns.filter((c) => isEditableType(c.dataType ?? c.data_type ?? ""));
    const built = buildInsertPayload(editableCols, primaryKey, newRowDrafts);
    return built.ok ? /** @type {Record<string, unknown>} */ (built.values) : null;
  }

  /** Open the DML preview for all staged changes (edits + deletes + a pending insert). */
  function applyPendingEdits() {
    const insertValues = pendingInsertValues();
    if ((!hasPendingChanges && !insertValues) || saving) return;
    // A row staged for deletion doesn't need its cell updates written first.
    const editEntries = [...pendingEdits.values()].filter((e) => !pendingDeletes.has(e.rowIdx));
    const deleteIndices = [...pendingDeletes].sort((a, b) => a - b);
    // Order: updates, deletes, then the insert. Inserting last keeps the existing
    // row indices (which the updates/deletes address) stable during execution.
    const statements = [
      ...buildUpdateStatements(editEntries, rows, dmlContext),
      ...(deleteIndices.length ? buildDeleteStatements(deleteIndices, rows, dmlContext) : []),
      ...(insertValues ? buildInsertStatements(insertValues, dmlContext) : []),
    ];
    const parts = [];
    if (editEntries.length) parts.push(`${editEntries.length} cell${editEntries.length === 1 ? "" : "s"} updated`);
    if (deleteIndices.length) parts.push(`${deleteIndices.length} row${deleteIndices.length === 1 ? "" : "s"} deleted`);
    if (insertValues) parts.push("1 row inserted");
    requestWrite({
      kind: deleteIndices.length ? "delete" : insertValues && !editEntries.length ? "insert" : "update",
      title: "Review changes",
      description: `${parts.join(", ")}.${deleteIndices.length ? " Deletions cannot be undone." : ""}`,
      statements,
      confirmLabel: "Apply changes",
      destructive: deleteIndices.length > 0,
      run: executePendingChanges,
    });
  }

  /** Flush all staged edits and deletes (and a pending insert) to the database. */
  async function executePendingChanges() {
    const insertValues = pendingInsertValues();
    if ((!hasPendingChanges && !insertValues) || saving) return;
    // Edits first (skipping rows about to be deleted), then the deletes.
    const entries = [...pendingEdits.values()].filter((e) => !pendingDeletes.has(e.rowIdx));
    /** @type {typeof entries} */
    const failed = [];
    let okCount = 0;
    for (const edit of entries) {
      try {
        await onsave({ rowIdx: edit.rowIdx, colIdx: edit.colIdx, value: edit.value });
        okCount++;
      } catch (err) {
        failed.push(edit);
        toast.error("Could not save", { description: String(err) });
      }
    }

    let deletedCount = 0;
    const deleteIndices = [...pendingDeletes].sort((a, b) => a - b);
    if (deleteIndices.length) {
      try {
        await ondelete({ rowIndices: deleteIndices });
        deletedCount = deleteIndices.length;
        pendingDeletes = new Set();
      } catch (err) {
        toast.error("Could not delete", { description: String(err) });
      }
    }

    // Insert last so the row indices addressed by the updates/deletes above stay
    // valid throughout. oninsertrow surfaces its own toast + refetch.
    if (insertValues) {
      try {
        await oninsertrow(insertValues);
        cancelNewRow();
      } catch {
        // error toast already shown by oninsertrow
      }
    }

    // Keep only the edits that failed so the user can retry / reset them — unless
    // deletes ran, which splice `rows` and invalidate the failed edits' row indices;
    // in that case drop them so a retry can't target the wrong row.
    const next = new Map();
    if (deletedCount === 0) {
      for (const edit of failed) next.set(editKey(edit.rowIdx, edit.colIdx), edit);
    }
    pendingEdits = next;
    pastEdits = [];
    futureEdits = [];
    // Sync the cross-unmount cache to the post-apply state (clears it when empty).
    savePendingChanges(_persistKey, pendingEdits, pendingDeletes);
    if (okCount > 0 || deletedCount > 0) {
      const parts = [];
      if (okCount > 0) parts.push(`${okCount} cell${okCount === 1 ? "" : "s"} updated`);
      if (deletedCount > 0) parts.push(`${deletedCount} row${deletedCount === 1 ? "" : "s"} deleted`);
      toast.success("Changes applied", { description: parts.join(", ") });
    }
  }

  /** Discard all staged edits and deletes. */
  function resetPendingEdits() {
    if (!hasPendingChanges) return;
    pendingEdits = new Map();
    pendingDeletes = new Set();
    pastEdits = [];
    futureEdits = [];
    clearPendingChanges(columnWidthsKey ?? '');
  }

  /** Collapse any range back to the single focused cell. */
  function clearCellRange() {
    if (selAnchor !== null) selAnchor = null;
  }

  /** Write text to the clipboard, falling back to execCommand when the async
   *  Clipboard API is unavailable/blocked (some Tauri webview configs). */
  async function writeClipboard(/** @type {string} */ text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall through to execCommand */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  /** Plain-text value of a cell for range copy (TSV). */
  function cellCopyText(/** @type {number} */ rowIdx, /** @type {number} */ actualIdx) {
    const v = effectiveCellValue(rowIdx, actualIdx);
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
    return String(v);
  }

  /** Copy the current rectangular range to the clipboard as TSV (paste-ready for Sheets/Excel). */
  async function copyCellRange() {
    const range = computeCellRange();
    if (!range) return false;
    const cols = navigableColumns.slice(range.c0, range.c1 + 1);
    const actualIdxs = cols.map((col) => _nameToActualIdx.get(col.name) ?? -1);
    /** @type {string[]} */
    const lines = [];
    for (let r = range.r0; r <= range.r1; r++) {
      lines.push(actualIdxs.map((ai) => cellCopyText(r, ai).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t'));
    }
    const nCells = (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
    if (await writeClipboard(lines.join('\n'))) {
      toast.success(`Copied ${nCells} cell${nCells === 1 ? '' : 's'}`);
      return true;
    }
    toast.error('Could not copy');
    return false;
  }

  // Surface staged-edit state to the parent (→ StatusBar Apply/Reset buttons).
  $effect(() => {
    applyEdits = applyPendingEdits;
    resetEdits = resetPendingEdits;
  });
  $effect(() => { pendingEditCount = pendingEdits.size + pendingDeletes.size; });

  // Surface scroll-to-top / scroll-to-bottom to the parent (→ StatusBar buttons).
  $effect(() => {
    scrollToTop = () => tableContainer?.scrollTo({ top: 0 });
    scrollToBottom = () => { if (tableContainer) tableContainer.scrollTo({ top: tableContainer.scrollHeight }); };
    scrollToLeft = () => tableContainer?.scrollTo({ left: 0 });
    scrollToRight = () => { if (tableContainer) tableContainer.scrollTo({ left: tableContainer.scrollWidth }); };
    focusColumn = focusColumnByName;
    getScroll = () => ({ left: _scrollLeft, top: _scrollTop });
    applyScroll = (pos) => {
      // Wait for the new tab's columns/rows to lay out (spacer width) before
      // setting scroll — otherwise the container clamps to 0.
      tick().then(() => requestAnimationFrame(() => {
        const el = tableContainer;
        if (!el) return;
        el.scrollLeft = Math.max(0, pos.left ?? 0);
        el.scrollTop = Math.max(0, pos.top ?? 0);
        _scrollLeft = el.scrollLeft;
        _scrollTop = el.scrollTop;
        scheduleDraw();
      }));
    };
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
      // Focus first non-auto column (all columns, including hidden ones)
      const first = columns.find(c => {
        const dt = c.dataType ?? c.data_type ?? ''
        return !isLikelyAutoColumn(dt, c.name, primaryKey)
      })
      newRowFocusCol = first?.name ?? columns[0]?.name ?? null
      // Scroll to top so the draft row is visible
      tableContainer?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })

  // Surface staged-delete-of-selection to the parent (⌘⌫ / toolbar delete).
  $effect(() => {
    stageDeleteSelected = () => {
      if (readonly || selected.size === 0) return;
      if (!primaryKey.length) {
        toast.error("Cannot delete", { description: "This table has no primary key." });
        return;
      }
      const next = new Set(pendingDeletes);
      for (const ri of selected) next.add(ri);
      pendingDeletes = next;
      scheduleDraw();
    }
  })

  function cancelNewRow() {
    newRowDrafts = null
    newRowFocusCol = null
  }

  function submitNewRow() {
    if (!newRowDrafts || insertSaving) return
    const editableCols = columns.filter(c => isEditableType(c.dataType ?? c.data_type ?? ''))
    const built = buildInsertPayload(editableCols, primaryKey, newRowDrafts)
    if (!built.ok) {
      toast.error('Cannot insert row', { description: built.message })
      return
    }
    const values = /** @type {Record<string, unknown>} */ (built.values)
    requestWrite({
      kind: "insert",
      title: "Review insert",
      description: "A new row will be inserted.",
      statements: buildInsertStatements(values, dmlContext),
      confirmLabel: "Insert row",
      destructive: false,
      run: () => executeInsertRow(values),
    })
  }

  /** @param {Record<string, unknown>} values */
  async function executeInsertRow(values) {
    try {
      await oninsertrow(values)
      newRowDrafts = null
      newRowFocusCol = null
    } catch {
      // error toast already shown by oninsertrow
    }
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
      const editableCols = columns.filter(c => {
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
    const record = rowToRecord(columns, rows[rowIdx] ?? [], hiddenColumns);
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

  /** Full text of an object cell for copy/export — oversize sentinels become
   * their marker + preview so exports show the truncation explicitly. */
  function cellJsonString(value) {
    const over = oversizeCellInfo(value);
    return over ? oversizeCellText(over) : JSON.stringify(value);
  }

  /** Escape a cell value for CSV (RFC 4180). */
  function csvCell(value) {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'object' ? cellJsonString(value) : String(value);
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
      const s = cellJsonString(value).replace(/'/g, "''");
      return `'${s}'`;
    }
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  /** Markdown-safe cell text. */
  function mdCell(value) {
    if (value === null || value === undefined) return 'NULL';
    const s = typeof value === 'object' ? cellJsonString(value) : String(value);
    return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  async function copyColSelection() {
    const activeCols = columns.filter((c) => selectedCols.has(c.name))
    if (!activeCols.length) return
    const rowIndices = selected.size > 0
      ? [...selected].sort((a, b) => a - b)
      : rows.map((_, i) => i)
    const header = activeCols.map((c) => csvCell(c.name)).join('\t')
    const body = rowIndices
      .map((i) => activeCols.map((c) => {
        const ci = columns.indexOf(c)
        const v = rows[i]?.[ci]
        return v === null || v === undefined ? '' : typeof v === 'object' ? cellJsonString(v) : String(v)
      }).join('\t'))
      .join('\n')
    const text = header + '\n' + body
    try {
      await navigator.clipboard.writeText(text)
      const colLabel = activeCols.length === 1 ? activeCols[0].name : `${activeCols.length} columns`
      toast.success(`Copied ${colLabel} (${rowIndices.length} rows)`)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  async function copyAs(rowIdx, format) {
    const indices = copyTargetIndices(rowIdx);
    const allRows = indices.map((i) => rows[i] ?? []);
    let text = '';
    const label = indices.length > 1 ? `${indices.length} rows` : '1 row';

    // Human-readable formats mirror the on-screen columns, so they omit hidden
    // ones; INSERT reconstructs the row and therefore keeps every column.
    const visIdxs = columns.map((_, i) => i).filter((i) => !hiddenColumns.has(columns[i].name));
    const cols = visIdxs.map((i) => columns[i]);
    const colNames = cols.map((c) => c.name);
    const dataRows = visIdxs.length === columns.length ? allRows : allRows.map((r) => visIdxs.map((i) => r[i]));

    if (format === 'csv') {
      const header = colNames.map(csvCell).join(',');
      const body = dataRows.map((r) => r.map(csvCell).join(',')).join('\n');
      text = header + '\n' + body;
    } else if (format === 'json') {
      const records = dataRows.map((r) => rowToRecord(cols, r));
      text = formatJsonValue(indices.length === 1 ? records[0] : records);
    } else if (format === 'plain') {
      text = dataRows
        .map((r) =>
          colNames.map((name, i) => {
            const v = r[i];
            const s = v === null || v === undefined ? 'NULL' : typeof v === 'object' ? cellJsonString(v) : String(v);
            return `${name}: ${s}`;
          }).join('\n'),
        )
        .join('\n\n');
    } else if (format === 'markdown') {
      const sep = colNames.map(() => '---').join(' | ');
      const header = colNames.map(mdCell).join(' | ');
      text = `| ${header} |\n| ${sep} |\n${dataRows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n')}`;
    } else if (format === 'insert') {
      const tbl = schema ? `"${schema}"."${tableName || 'table'}"` : `"${tableName || 'table'}"`;
      const insertCols = columns.map((c) => `"${c.name}"`).join(', ');
      text = allRows
        .map((r) => `INSERT INTO ${tbl} (${insertCols}) VALUES (${r.map(sqlLiteral).join(', ')});`)
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
    // A NOT NULL column can't hold NULL — reject up front with a clear message
    // instead of staging an edit that the database will refuse on apply. Matches
    // the inline editor, which hides the NULL option for non-nullable columns.
    if (col.nullable === false) {
      toast.error("Cannot set NULL", { description: `"${col.name}" is NOT NULL.` });
      return;
    }
    if (effectiveCellValue(rowIdx, colIdx) === null) {
      toast.message("Already NULL");
      return;
    }
    const prevValue = effectiveCellValue(rowIdx, colIdx);
    stageEdit(rowIdx, colIdx, null);
    pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: prevValue, newValue: null }];
    futureEdits = [];
  }

  /** Open the dedicated array editor for a cell (from the context menu). */
  function openArrayEditor(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col) return;
    const v = effectiveCellValue(rowIdx, colIdx);
    arrayEditorRow = rowIdx;
    arrayEditorCol = colIdx;
    arrayEditorColName = col.name ?? "array";
    arrayEditorType = String(col.dataType ?? col.data_type ?? _colCache[colIdx]?.colType ?? "").replace(/\[\]\s*$/, "");
    arrayEditorValue = Array.isArray(v) ? v : [];
    arrayEditorOpen = true;
  }

  /** Save the edited array — stage a Postgres array literal (backend casts it). */
  function commitArrayEditor(next) {
    const rowIdx = arrayEditorRow, colIdx = arrayEditorCol;
    if (!canEditColumn(colIdx)) return;
    const prevValue = effectiveCellValue(rowIdx, colIdx);
    const literal = pgArrayText(next); // {a,b} — quoting/escaping handled
    stageEdit(rowIdx, colIdx, literal);
    pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: prevValue, newValue: literal }];
    futureEdits = [];
  }

  /** Run an extension transform on a cell, copy the result, and show it in a
   *  readable result card (monospace, pretty-printed, with a Copy action). */
  async function runCellTransform(rowIdx, colIdx, transform) {
    const value = effectiveCellValue(rowIdx, colIdx);
    try {
      const out = transform.run(value);
      await navigator.clipboard.writeText(out);
      // Pretty-print JSON output; cap the preview so the toast stays compact.
      let preview = out;
      try { preview = JSON.stringify(JSON.parse(out), null, 2); } catch { /* not JSON */ }
      const capped = preview.length > 1200 ? preview.slice(0, 1200) + "\n…" : preview;
      toast.success(`${transform.label} · copied`, {
        description: capped,
        code: true,
        duration: 8000,
        action: { label: "Copy again", onClick: () => navigator.clipboard.writeText(out) },
      });
    } catch (e) {
      toast.error("Could not apply transform", { description: String(e?.message ?? e) });
    }
  }

  /** Stage a generated value (UUIDv7, nanoid, …) into an editable cell. */
  function insertGeneratedValue(rowIdx, colIdx, generator) {
    if (!canEditColumn(colIdx)) return;
    const prevValue = effectiveCellValue(rowIdx, colIdx);
    const next = generator.generate();
    stageEdit(rowIdx, colIdx, next);
    pastEdits = [...pastEdits.slice(-49), { rowIdx, colIdx, oldValue: prevValue, newValue: next }];
    futureEdits = [];
  }

  /** @param {number} rowIdx */
  function rowIndicesToDelete(rowIdx) {
    if (selected.size > 0 && selected.has(rowIdx)) {
      return [...selected].sort((a, b) => a - b);
    }
    return [rowIdx];
  }

  /**
   * Stage the row(s) for deletion — shown with a red diff marker until Apply.
   * Deletes are batched with edits and flushed together from the Apply button.
   * @param {number} rowIdx
   */
  function deleteRow(rowIdx) {
    if (readonly) return;
    if (!primaryKey.length) {
      toast.error("Cannot delete", {
        description: "This table has no primary key.",
      });
      return;
    }
    const rowIndices = rowIndicesToDelete(rowIdx);
    const next = new Set(pendingDeletes);
    for (const ri of rowIndices) next.add(ri);
    pendingDeletes = next;
    scheduleDraw();
  }

  /** Unstage a row previously marked for deletion. @param {number} rowIdx */
  function undoDeleteRow(rowIdx) {
    if (!pendingDeletes.has(rowIdx)) return;
    const next = new Set(pendingDeletes);
    next.delete(rowIdx);
    pendingDeletes = next;
    scheduleDraw();
  }

  /** @param {number} rowIdx */
  async function duplicateRow(rowIdx) {
    if (readonly) return;
    const row = rows[rowIdx];
    if (!row) return;
    const record = rowToRecord(columns, row);
    for (const pk of primaryKey) delete record[pk];
    try {
      await oninsertrow(record);
    } catch {
      // error toast already shown by oninsertrow
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
    // Alt+Enter saves this cell straight to the database, bypassing
    // the staged Apply/Reset queue.
    if (e.altKey && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void commitEditImmediate("down");
      return;
    }
    // Enter (or Ctrl/Cmd+Enter) confirms the edit into the staged queue and
    // moves to the next row.
    if (e.key === "Enter") {
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
  // ── Column reorder (display-only) ──────────────────────────────────────────
  // Rows are position-indexed arrays and cells resolve by column *name* (see
  // _nameToActualIdx), so reordering the visible-column list moves NOTHING in the
  // row data — it's a pure layout change and stays O(visible cols). `columnOrder`
  // is the display order of column names; names absent from it keep their natural
  // order after the ordered ones. Persisted per table.
  let columnOrder = $state(/** @type {string[]} */ ([]));
  const _colOrderKey = $derived(`stroke:colorder:${schema}\x00${tableName}`);
  $effect(() => {
    const key = _colOrderKey;
    untrack(() => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        columnOrder = Array.isArray(parsed) ? parsed : [];
      } catch { columnOrder = []; }
    });
  });
  function persistColumnOrder() {
    try { localStorage.setItem(_colOrderKey, JSON.stringify(columnOrder)); } catch {}
  }
  /**
   * Move a column within the visible display order.
   * @param {string} name @param {'left'|'right'|'first'|'last'} where
   */
  function moveColumn(name, where) {
    const order = visibleColumns.map((c) => c.name);
    const from = order.indexOf(name);
    if (from < 0) return;
    order.splice(from, 1);
    const to =
      where === 'first' ? 0 :
      where === 'last'  ? order.length :
      where === 'left'  ? Math.max(0, from - 1) :
      /* right */         Math.min(order.length, from + 1);
    order.splice(to, 0, name);
    columnOrder = order;
    persistColumnOrder();
  }
  function resetColumnOrder() {
    columnOrder = [];
    persistColumnOrder();
  }

  const visibleColumns = $derived.by(() => {
    const vis = columns.filter((c) => !hiddenColumns.has(c.name));
    if (columnOrder.length === 0) return vis;
    const pos = new Map(columnOrder.map((n, i) => [n, i]));
    // Stable: ordered names by their position; unlisted keep original order last.
    return vis
      .map((c, i) => ({ c, i, k: pos.has(c.name) ? /** @type {number} */ (pos.get(c.name)) : Infinity }))
      .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k - b.k))
      .map((e) => e.c);
  });

  // ── Column header highlight + tag ────────────────────────────────────────────
  // A persistent colour band on a column's header bar plus an optional short text
  // tag. Purely cosmetic, persisted per table, and independent of the transient
  // click-to-select highlight (selectedCols) above.
  // Muted, desaturated tones — refined "label" colours that read as intentional
  // on the dark header rather than saturated neon. (Tailwind-500 looked garish.)
  const COL_HIGHLIGHTS = /** @type {const} */ ([
    { id: 'red',    label: 'Red',    hex: '#dd8a8a' },
    { id: 'amber',  label: 'Amber',  hex: '#cbab7e' },
    { id: 'green',  label: 'Green',  hex: '#8fc4a3' },
    { id: 'blue',   label: 'Blue',   hex: '#8bb0d6' },
    { id: 'purple', label: 'Purple', hex: '#b1a2e0' },
    { id: 'pink',   label: 'Pink',   hex: '#d3a0c6' },
  ]);
  const COL_HL_MAP = new Map(COL_HIGHLIGHTS.map((h) => [h.id, h.hex]));
  /** @type {Record<string, { color?: string, tag?: string }>} */
  let colHighlights = $state({});
  const _colHlKey = $derived(`stroke:colhl:${schema}\x00${tableName}`);
  $effect(() => {
    const key = _colHlKey;
    untrack(() => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        colHighlights = parsed && typeof parsed === 'object' ? parsed : {};
      } catch { colHighlights = {}; }
    });
  });
  function persistColHighlights() {
    try {
      if (Object.keys(colHighlights).length) localStorage.setItem(_colHlKey, JSON.stringify(colHighlights));
      else localStorage.removeItem(_colHlKey);
    } catch {}
  }
  /** @param {string} name @param {string|null} colorId */
  function setColHighlight(name, colorId) {
    const next = { ...colHighlights };
    const entry = { ...(next[name] ?? {}) };
    if (colorId) entry.color = colorId; else delete entry.color;
    if (entry.color || entry.tag) next[name] = entry; else delete next[name];
    colHighlights = next;
    persistColHighlights();
    scheduleDraw();
  }
  /** @param {string} name @param {string} tag */
  function setColTag(name, tag) {
    const next = { ...colHighlights };
    const entry = { ...(next[name] ?? {}) };
    const t = (tag ?? '').trim().slice(0, 24);
    if (t) entry.tag = t; else delete entry.tag;
    if (entry.color || entry.tag) next[name] = entry; else delete next[name];
    colHighlights = next;
    persistColHighlights();
    scheduleDraw();
  }
  // ── Per-column transform ─────────────────────────────────────────────────────
  // A cell transform (Decode JWT, Epoch → date, Base64 decode, …) chosen for a
  // whole column; the transformed value renders live in every cell. Persisted
  // per table, independent of highlight/tag.
  /** @type {Record<string, string>} colName → transform id */
  let colTransforms = $state({});
  const _colTfKey = $derived(`stroke:coltf:${schema}\x00${tableName}`);
  $effect(() => {
    const key = _colTfKey;
    untrack(() => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        colTransforms = parsed && typeof parsed === 'object' ? parsed : {};
      } catch { colTransforms = {}; }
    });
  });
  function persistColTransforms() {
    try {
      if (Object.keys(colTransforms).length) localStorage.setItem(_colTfKey, JSON.stringify(colTransforms));
      else localStorage.removeItem(_colTfKey);
    } catch {}
  }
  /** @param {string} name @param {string|null} id */
  function setColTransform(name, id) {
    const next = { ...colTransforms };
    if (id) next[name] = id; else delete next[name];
    colTransforms = next;
    persistColTransforms();
    scheduleDraw();
  }
  // Active transforms resolved to their run fns (+ bound column type/name).
  const _colTransformFns = $derived.by(() => {
    void $pluginState;
    /** @type {Record<string, { id: string, run: Function, colType: string, name: string }>} */
    const out = {};
    for (const [name, id] of Object.entries(colTransforms)) {
      const t = transformById(id);
      if (!t) continue;
      const ai = _nameToActualIdx.get(name) ?? -1;
      out[name] = { id: t.id, run: t.run, colType: _colCache[ai]?.colType ?? '', name };
    }
    return out;
  });
  /** Transformed display text for a column-transformed cell, cached per row. */
  const _colTfCache = new WeakMap();
  /** @param {unknown[]} row @param {number} actualIdx @param {unknown} value @param {{id:string,run:Function,colType:string,name:string}} tf */
  function colTransformText(row, actualIdx, value, tf) {
    if (value === null || value === undefined) return '';
    let m = _colTfCache.get(row);
    if (!m) { m = new Map(); _colTfCache.set(row, m); }
    const k = actualIdx + ':' + tf.id;
    let cached = m.get(k);
    if (cached === undefined) {
      try { cached = displayCell(String(tf.run(value, tf.colType, tf.name))); }
      catch { cached = displayCell(value); }
      m.set(k, cached);
    }
    return cached;
  }

  // Tag input dialog
  let tagDialogOpen = $state(false);
  let tagDialogCol = $state('');
  let tagDialogValue = $state('');
  /** @param {string} name */
  function openTagDialog(name) {
    tagDialogCol = name;
    tagDialogValue = colHighlights[name]?.tag ?? '';
    tagDialogOpen = true;
  }
  function confirmTag() {
    if (tagDialogCol) setColTag(tagDialogCol, tagDialogValue);
    tagDialogOpen = false;
  }

  // ── Virtual relationship columns (reverse FK / one-to-many) ─────────────────
  // One per unique fromTable, max 8. Shown as badge columns to the right of real data.
  const MAX_VIRTUAL_COLS = 5
  /** User-overridden logical width for all virtual rel columns (null = auto-computed). */
  let virtualColWidthOverride = $state(/** @type {number | null} */ (null))
  // Width adapts to the longest label (7px/char estimate + padding), clamped 110–180px
  const VIRTUAL_COL_W = $derived.by(() => {
    if (virtualColWidthOverride !== null) return Math.round(virtualColWidthOverride * canvasZoom)
    if (!virtualRelCols.length) return Math.round(200 * canvasZoom)
    // Fit the badge with comfortable side gaps instead of a fixed ~300px slab, so
    // the centered pill reads as intentional rather than floating in dead space.
    const maxChars = Math.max(...virtualRelCols.map(v => v.label.length))
    const base = Math.min(260, Math.max(150, maxChars * 8 + 44))
    return Math.round(base * canvasZoom)
  })
  const virtualRelCols = $derived.by(() => {
    if (!incomingForeignKeys.length) return /** @type {typeof incomingForeignKeys} */ ([])
    const seen = new Set()
    const result = []
    for (const fk of incomingForeignKeys) {
      if (seen.has(fk.fromTable)) continue
      seen.add(fk.fromTable)
      const label = (fk.fromSchema && fk.fromSchema !== schema) ? `${fk.fromSchema}.${fk.fromTable}` : fk.fromTable
      if (hiddenColumns.has(`__vrel:${label}`)) continue
      result.push({ ...fk, label })
      if (result.length >= MAX_VIRTUAL_COLS) break
    }
    return result
  })
  // ── Virtual expression columns (user-defined templates) ──────────────────────
  const VEXPR_COL_DEFAULT_W = 220
  const _tableKey = $derived(`${schema}.${tableName}`)
  /** Active (enabled) virtual expr col defs for current table */
  const _vcols = $derived.by(() => {
    const all = $virtualColumnsStore[_tableKey] ?? []
    return all.filter(c => c.enabled)
  })
  /**
   * Bound evaluator functions — compiled once when columns change, not per-render.
   * Each fn takes a row array and returns the computed string.
   */
  const _vcolFns = $derived.by(() => {
    const nameToIdx = _nameToActualIdx
    return _vcols.map(vc => bindExpr(vc.expression, nameToIdx))
  })
  /** Canvas-space x/w layout for each active vexpr col */
  const _vexprLayout = $derived.by(() => {
    let x = geom.totalWidth
    return _vcols.map((vc, i) => {
      const w = Math.round((_vexprWidths[vc.id] ?? VEXPR_COL_DEFAULT_W) * canvasZoom)
      // hoverKey is precomputed here so the per-row draw loop never builds the
      // `__vcol__${id}` string per cell per frame (GC churn on the scroll path).
      const pos = { id: vc.id, name: vc.name, x, w, fnIdx: i, hoverKey: `__vcol__${vc.id}` }
      x += w
      return pos
    })
  })
  /** Precomputed `__vrel__N` hover keys — same per-frame allocation avoidance. */
  const _vrelHoverKeys = $derived(virtualRelCols.map((_, i) => `__vrel__${i}`))
  const vexprTotalW = $derived(
    _vexprLayout.length > 0
      ? _vexprLayout[_vexprLayout.length - 1].x + _vexprLayout[_vexprLayout.length - 1].w - geom.totalWidth
      : 0
  )

  // Total scrollable width includes virtual expr cols + virtual rel columns
  const totalContentWidth = $derived(geom.totalWidth + vexprTotalW + virtualRelCols.length * VIRTUAL_COL_W)
  // Surface whether the grid overflows horizontally so the parent can show the
  // go-to-left / go-to-right controls only when they'd actually do something.
  $effect(() => {
    canScrollHorizontally = totalContentWidth > _viewportWidth + 1
  })
  // Insert row spans ALL columns (including hidden) so every field can be filled.
  const insertRowTotalWidth = $derived(
    gutterWidth + columns.reduce((acc, c) => acc + widthForColumn(c.name, c.dataType ?? c.data_type ?? ''), 0)
  )

  // +1 for the trailing auto-width spacer column (keeps real columns stable).
  const dataColSpan = $derived(visibleColumns.length + 1);
  const totalColSpan = $derived(
    (showRowExpand ? 1 : 0) + (showSelection ? 1 : 0) + visibleColumns.length + 1,
  )
  const navigableColumns = $derived(visibleColumns)

  // ── Accessibility: focused-cell announcement ────────────────────────────────
  // The canvas grid has no per-cell DOM, so screen readers get nothing on
  // navigation. This derived builds a short description of the focused cell and
  // is rendered into an aria-live region. It depends ONLY on focus/edit state and
  // the data — NOT on scroll offsets — so it never recomputes during the rAF draw
  // loop and cannot affect render throughput.
  const a11yCellAnnouncement = $derived.by(() => {
    if (focusedRow === null || focusedCol === null) return ''
    const ai = visToActualColIdx(focusedCol)
    if (ai < 0) return ''
    const col = columns[ai]
    const row = rows[focusedRow]
    if (!col || !row) return ''
    const raw = formatCell(row[ai])
    const val = raw.length > 80 ? raw.slice(0, 80) + '…' : raw
    const editing = editingCell && editingCell.rowIdx === focusedRow && editingCell.colIdx === ai
    return `Row ${focusedRow + 1} of ${rows.length}, ${col.name}: ${val}${editing ? ', editing' : ''}`
  })
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
  // null when no row is expanded (the common case) → rowDocTop/rowIndexAtY use
  // O(1) `idx * ROW_HEIGHT` math and no per-page Float64Array is allocated.
  const rowTops = $derived(computeRowTops(rows.length, expandedRows, 280, ROW_HEIGHT, expandedRowHeights))
  /** Total scrollable content height incl. header + insert slot + body + 2-row bottom margin. */
  const contentHeight = $derived(HEADER_H + insertRowOffset + (rowTops ? rowTops[rows.length] : rows.length * ROW_HEIGHT) + ROW_HEIGHT * 2)

  /** True while the scroll rAF loop is live — gates DOM-overlay work that would
   *  otherwise re-render every scroll frame (resize handles reposition per frame
   *  via keyed style writes; nobody can grab one mid-scroll anyway). */
  let _isScrolling = $state(false)
  const _EMPTY_HANDLES = /** @type {{ name: string, x: number }[]} */ ([])

  /** Viewport-visible column resize handles (DOM overlay — not on the canvas). */
  const resizeHandles = $derived.by(() => {
    if (_isScrolling) return _EMPTY_HANDLES
    /** @type {{ name: string, x: number }[]} */
    const out = []
    // Handles hidden behind the frozen pinned region are dropped — except the
    // pinned columns' own edges, which are what defines that region.
    const occludeLeft = geom.frozenWidth
    for (const col of geom.cols) {
      const x = colDrawnX(col, geom, _scrollLeft) + col.w
      if ((!col.pinned && x < occludeLeft - 6) || x > _viewportWidth + 6) continue
      out.push({ name: col.name, x })
    }
    // Virtual expr column resize handles
    for (const vc of _vexprLayout) {
      const x = vc.x + vc.w - _scrollLeft
      if (x < occludeLeft - 6 || x > _viewportWidth + 6) continue
      out.push({ name: `__vcol__${vc.id}`, x })
    }
    // Virtual rel column resize handles (right edge of each virtual col)
    for (let vi = 0; vi < virtualRelCols.length; vi++) {
      const x = geom.totalWidth + vexprTotalW + (vi + 1) * VIRTUAL_COL_W - _scrollLeft
      if (x < occludeLeft - 6 || x > _viewportWidth + 6) continue
      out.push({ name: `__vrel__${vi}`, x })
    }
    return out
  })

  /** Document-space y of a body row's top (0 = top of the sizer). */
  function rowDocTop(/** @type {number} */ idx) {
    return HEADER_H + insertRowOffset + (rowTops ? (rowTops[idx] ?? idx * ROW_HEIGHT) : idx * ROW_HEIGHT)
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
      // A fresh page of rows (page/filter/sort/search) invalidates row-index-keyed
      // staged changes — drop them and their cache entry so a later Apply can't
      // target the wrong rows.
      if (pendingEdits.size) pendingEdits = new Map()
      if (pendingDeletes.size) pendingDeletes = new Set()
      clearPendingChanges(columnWidthsKey ?? '')
      // A fresh row set also invalidates the row-index-keyed cell range.
      if (selAnchor !== null) selAnchor = null
    })
  })

  // Persist staged changes when the component tears down (switching to a SQL/AI
  // tab unmounts DataTable) so they survive until the user returns to the table.
  onDestroy(() => {
    savePendingChanges(_persistKey, pendingEdits, pendingDeletes)
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
      for (const raw of idx.columns.split(',')) {
        const col = raw.trim()
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

  // Per-column numeric stats for heatmap + annotator extensions. Computed once
  // per data/settings change (NOT per render), sampled to bound cost on big
  // infinite-scroll result sets. Returns null when no stats-dependent extension
  // is enabled, so the scan is skipped entirely in the common case.
  const STATS_SAMPLE = 5000
  const STATS_BUCKETS = 24
  const _statsNumericRe = /(int|numeric|decimal|real|double|float|money|number|serial)/i
  const _colStats = $derived.by(() => {
    void $pluginState
    if (!statsNeeded() && !annotatorEnabled()) return null
    const wantHist = annotatorEnabled()
    const n = Math.min(rows.length, STATS_SAMPLE)
    /** @type {Map<number, { numeric: boolean, min: number, max: number, nulls: number, total: number, hist: number[] | null }>} */
    const map = new Map()
    for (let a = 0; a < columns.length; a++) {
      const numeric = _statsNumericRe.test(String(columns[a]?.dataType ?? columns[a]?.data_type ?? ''))
      let min = Infinity, max = -Infinity, nulls = 0
      for (let r = 0; r < n; r++) {
        const v = rows[r]?.[a]
        if (v === null || v === undefined) { nulls++; continue }
        if (numeric) {
          const num = typeof v === 'number' ? v : Number(v)
          if (Number.isFinite(num)) { if (num < min) min = num; if (num > max) max = num }
        }
      }
      let hist = null
      if (wantHist && numeric && max > min) {
        hist = new Array(STATS_BUCKETS).fill(0)
        const span = max - min
        for (let r = 0; r < n; r++) {
          const v = rows[r]?.[a]
          if (v === null || v === undefined) continue
          const num = typeof v === 'number' ? v : Number(v)
          if (!Number.isFinite(num)) continue
          const b = Math.min(STATS_BUCKETS - 1, Math.floor(((num - min) / span) * STATS_BUCKETS))
          hist[b]++
        }
      }
      map.set(a, { numeric, min: numeric ? min : NaN, max: numeric ? max : NaN, nulls, total: n, hist })
    }
    return map
  })

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
    _zoomGuard.resizing = true
    _zoomGuard.block = true
    if (colName.startsWith('__vcol__')) {
      const id = colName.slice(8)
      resizeStartWidth = _vexprWidths[id] ?? VEXPR_COL_DEFAULT_W
    } else if (colName.startsWith('__vrel__')) {
      resizeStartWidth = virtualColWidthOverride ?? Math.round(VIRTUAL_COL_W / canvasZoom)
    } else {
      resizeStartWidth = columnWidths[colName] ?? defaultColumnWidth("")
    }
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
      if (resizingColName.startsWith('__vcol__')) {
        const id = resizingColName.slice(8)
        _vexprWidths = { ..._vexprWidths, [id]: _pendingResizeWidth }
      } else if (resizingColName.startsWith('__vrel__')) {
        virtualColWidthOverride = _pendingResizeWidth;
      } else {
        columnWidths = { ...columnWidths, [resizingColName]: _pendingResizeWidth };
      }
    });
  }

  function endColumnResize() {
    if (_resizeRafId) {
      cancelAnimationFrame(_resizeRafId);
      _resizeRafId = 0;
      if (resizingColName) {
        if (resizingColName.startsWith('__vcol__')) {
          const id = resizingColName.slice(8)
          _vexprWidths = { ..._vexprWidths, [id]: _pendingResizeWidth }
        } else if (resizingColName.startsWith('__vrel__')) {
          virtualColWidthOverride = _pendingResizeWidth;
        } else {
          columnWidths = { ...columnWidths, [resizingColName]: _pendingResizeWidth };
        }
      }
    }
    if (resizingColName && !resizingColName.startsWith('__vrel__') && !resizingColName.startsWith('__vcol__')) {
      if (columnWidthsKey) saveColumnWidths(columnWidthsKey, columnWidths);
    }
    resizingColName = null;
    _zoomGuard.resizing = false
    _zoomGuard.block = false
  }

  /** Cycle sort: none → asc → desc → none */
  /** Current sort keys in priority order: primary (rowSort) then secondary. */
  function currentSortList() {
    return (rowSort ? [rowSort] : []).concat(rowSortMore ?? [])
  }

  /** colName → { direction, index, total } for header sort arrows + rank badges. */
  const _sortLookup = $derived.by(() => {
    const m = new Map()
    const list = (rowSort ? [rowSort] : []).concat(rowSortMore ?? [])
    list.forEach((s, i) => { if (s?.column) m.set(s.column, { direction: s.direction, index: i, total: list.length }) })
    return m
  })

  /** True while there are unsaved edits (sorting would reorder rows and desync
   *  the row-index-keyed staged changes). Warns the user. */
  function blockedBySort() {
    if (pendingEdits.size > 0) {
      toast.error("Unsaved changes", { description: "Apply or reset your edits before sorting." })
      return true
    }
    return false
  }

  /**
   * @param {string} colName
   * @param {boolean} [additive] shift-click: add/toggle this as a SECONDARY key
   *   instead of replacing the sort — enables multi-column sort.
   */
  function handleHeaderSort(colName, additive = false) {
    if (blockedBySort()) return
    if (additive) {
      const cur = currentSortList()
      const idx = cur.findIndex((s) => s.column === colName)
      let next
      if (idx === -1) next = [...cur, { column: colName, direction: 'asc' }]
      else if (cur[idx].direction === 'asc') next = cur.map((s, i) => i === idx ? { ...s, direction: 'desc' } : s)
      else next = cur.filter((_, i) => i !== idx) // asc → desc → remove
      onsortchange(next)
      return
    }
    // Plain click: single-key cycle none → desc → asc → none.
    if (rowSort?.column !== colName) onsortchange([{ column: colName, direction: 'desc' }])
    else if (rowSort.direction === 'desc') onsortchange([{ column: colName, direction: 'asc' }])
    else onsortchange([])
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
    if (blockedBySort()) return
    onsortchange([{ column: colName, direction: dir }])
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
  // Cap the per-tab cache: each entry can retain a whole FK sub-view's fetched
  // rows, so an unbounded map would accumulate row data for every table visited
  // in a session. LRU-evict the oldest once over the cap (Map keeps insertion
  // order; re-inserting on save moves an entry to the most-recent position).
  const TAB_EXPAND_CACHE_MAX = 12
  let _lastTabKey = $state(untrack(() => columnWidthsKey ?? ''))

  $effect(() => {
    const newKey = columnWidthsKey ?? ''
    if (newKey === _lastTabKey) return
    untrack(() => {
      // Save state for the tab we're leaving
      if (_lastTabKey !== undefined && _lastTabKey !== '') {
        _tabExpandCache.delete(_lastTabKey) // re-insert at MRU position
        _tabExpandCache.set(_lastTabKey, {
          expandedRows: new Set(expandedRows),
          fkSubview: fkSubview,
        })
        // Evict least-recently-used entries (oldest insertion order) over the cap.
        while (_tabExpandCache.size > TAB_EXPAND_CACHE_MAX) {
          const oldest = _tabExpandCache.keys().next().value
          if (oldest === undefined) break
          _tabExpandCache.delete(oldest)
        }
        // Preserve unsaved edits/deletes for the table we're leaving so they're
        // restored when the user returns instead of being silently discarded.
        savePendingChanges(_lastTabKey, pendingEdits, pendingDeletes)
      }
      // Restore state for the tab we're entering (fresh Set/null if first visit)
      const saved = _tabExpandCache.get(newKey)
      expandedRows = saved ? new Set(saved.expandedRows) : new Set()
      fkSubview = saved?.fkSubview ?? null
      const restored = loadPendingChanges(newKey)
      pendingEdits = restored.edits
      pendingDeletes = restored.deletes
      // Always reset non-content states
      focusedRow = null
      focusedCol = null
      selAnchor = null
      pastEdits = []
      futureEdits = []
      selectedCols = new Set()
      _lastHeaderClickedCol = null
      _lastTabKey = newKey
    })
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
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "c" || e.key === "C")) {
        // Copy the block selection as TSV. Handled at document capture so it fires
        // regardless of which element inside the grid holds focus.
        if (computeCellRange()) { e.preventDefault(); void copyCellRange(); }
        else if (selectedCols.size) { e.preventDefault(); void copyColSelection(); }
        else if (focusedRow !== null && focusedCol !== null) {
          const ai = visToActualColIdx(focusedCol);
          if (ai >= 0) { e.preventDefault(); void copyCellValue(focusedRow, ai); }
        }
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
    _scrollTop = Math.round(container.scrollTop)
    _scrollLeft = Math.round(container.scrollLeft)

    // Use contentRect directly — it's provided synchronously by the ResizeObserver
    // entry with no forced layout reflow. Removing the rAF here eliminates one full
    // frame of latency between the resize and the canvas redraw.
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      invalidateCanvasRect() // size/layout change can move the canvas — refresh hit-test rect
      _viewportWidth = r.width
      _viewportHeight = r.height
    })
    ro.observe(container)
    return () => ro.disconnect()
  })

  /** @param {Event & { currentTarget: HTMLElement }} e */
  // Continuous rAF loop that drives canvas redraws during scroll.
  // Reading scrollTop/scrollLeft inside rAF gives the compositor-synchronized
  // position for the frame being painted, eliminating the 1-frame lag that
  // a one-shot scheduleDraw() produces (queued from onscroll → fires next frame).
  // The loop runs while the user is scrolling and for 200ms after the last
  // scroll event to cover momentum/inertia, then stops to save GPU time.
  let _scrollLoopId = 0
  let _scrollLoopDeadline = 0
  // Last position the loop actually painted — lets it skip identical frames during
  // the momentum tail / step scrolling instead of re-running a full redraw for a
  // frame where nothing moved. Content changes (hover/edits) go through
  // scheduleDraw(), not this loop, so skipping unchanged-position frames is safe.
  let _loopLastTop = -1
  let _loopLastLeft = -1

  function startScrollLoop() {
    _scrollLoopDeadline = performance.now() + 200
    if (_scrollLoopId) return
    _loopLastTop = -1
    _loopLastLeft = -1
    _isScrolling = true
    function loop() {
      const el = tableContainer
      if (!el || !_ctx || _fatalError || performance.now() > _scrollLoopDeadline) {
        _scrollLoopId = 0
        _isScrolling = false
        return
      }
      // Snap to whole CSS pixels. The canvas is sticky-pinned at the viewport's
      // integer left edge, so drawing content at a fractional scrollLeft puts text
      // and gridlines on sub-pixel x — WebKit then re-antialiases them every frame,
      // which reads as horizontal "vibration". Integer offsets render stably.
      const st = Math.round(el.scrollTop)
      const sl = Math.round(el.scrollLeft)
      if (st !== _loopLastTop || sl !== _loopLastLeft) {
        _scrollTop = st
        _scrollLeft = sl
        _loopLastTop = st
        _loopLastLeft = sl
        try {
          draw()
        } catch (err) {
          reportFatal(err)
          _scrollLoopId = 0
          _isScrolling = false
          return
        }
      }
      _scrollLoopId = requestAnimationFrame(loop)
    }
    _scrollLoopId = requestAnimationFrame(loop)
  }

  function onContainerScroll(e) {
    const el = e.currentTarget
    invalidateCanvasRect()
    // Update state immediately so any synchronous consumers (hit-test etc.) are current.
    // Rounded to whole pixels to avoid sub-pixel shimmer during horizontal scroll.
    _scrollTop = Math.round(el.scrollTop)
    _scrollLeft = Math.round(el.scrollLeft)
    // Cancel any pending one-shot draw — the loop handles all scroll redraws at
    // the display's native frame rate (120Hz on ProMotion).
    if (_drawRafId) { cancelAnimationFrame(_drawRafId); _drawRafId = 0 }
    startScrollLoop()
    // Infinite scroll — trigger load when within 3 rows of the bottom
    if (infiniteScroll && !loadingMore) {
      const threshold = ROW_HEIGHT * 3
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
        onloadmore()
      }
    }
  }

  // ── Canvas backing context + colour reader ────────────────────────────────
  // Plain (non-reactive) holders. Canvas sizing + drawing happen together in the
  // single master effect below — keeping them in ONE effect avoids any read+write
  // ping-pong between separate effects.
  /** @type {CanvasRenderingContext2D | null} */
  let _ctx = null
  // Reused scratch buffer for per-frame vertical grid separators (see draw()) — a
  // module-lifetime array so the scroll hot path does zero allocation for it.
  const _vSepsBuf = /** @type {number[]} */ ([])
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
    const cell = measure('font-mono text-ui-xs')
    const type = measure('font-mono text-ui-3xs')
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
      _fonts = null // font family may have changed (--font-mono) — re-measure
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
    // Ctrl/Cmd + / - / 0: zoom the whole app (canvas scales in lockstep).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      if (e.key === '=' || e.key === '+') { e.preventDefault(); increaseZoom(); return }
      if (e.key === '-')                  { e.preventDefault(); decreaseZoom(); return }
      if (e.key === '0')                  { e.preventDefault(); resetZoom(); return }
    }

    // Ctrl+A: select all rows — but while editing a cell, let the input handle
    // its native "select all text" (don't preventDefault, or it's swallowed).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "a" || e.key === "A")) {
      if (!editingCell) {
        e.preventDefault();
        selected = new Set(rows.map((_, i) => i));
      }
      return;
    }

    // Ctrl+C (copy selection/range/cell) is handled by the document-capture
    // listener above so it works regardless of which grid element holds focus.

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
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "Enter" && !editingCell) {
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
    if (newRowDrafts) return;

    // Cmd/Ctrl+Arrow is table-level navigation (scroll to top/bottom, first/last
    // column, paginate) owned by the app-level handler in StudioShell. Let it
    // bubble instead of moving the cell cursor here — the old double-handling
    // (cursor jumped one cell AND the grid scrolled) made the shortcut feel
    // broken.
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft")
    ) {
      return;
    }

    const visLen = navigableColumns.length;
    const rowLen = rows.length;
    if (!rowLen || !visLen) return;

    const curRow = focusedRow ?? 0;
    const curCol = focusedCol ?? 0;

    // Range selection is disabled — a plain arrow / Tab just collapses any stray
    // range back to the single focused cell. (Shift+Arrow no longer extends a
    // rectangular range; see the commented range sources below.)
    if (
      e.key === "ArrowDown" || e.key === "ArrowUp" ||
      e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Tab"
    ) {
      clearCellRange();
    }

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
        // Priority: close FK sub-view → collapse cell range → clear col selection
        // → close the most-recently-expanded row → clear cell focus.
        if (fkSubview !== null) { fkSubview = null; break; }
        if (computeCellRange()) { clearCellRange(); scheduleDraw(); break; }
        if (selectedCols.size) { selectedCols = new Set(); _lastHeaderClickedCol = null; scheduleDraw(); break; }
        if (expandedRows.size > 0) { toggleRowExpand(/** @type {number} */ ([...expandedRows].pop())); break; }
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
  const CELL_PAD_X = $derived(Math.round(10 * canvasZoom))
  const ICON_HIT = $derived(Math.round(24 * canvasZoom))

  // Cached glyph advance for the active ctx.font. Every table font is monospace,
  // so text width is O(1) (charCount × advance). This replaces the per-cell
  // measureText() binary search that was the main scroll-framerate bottleneck.
  // Re-measured automatically whenever ctx.font changes (zoom / cell vs header).
  let _glyphW = 0
  let _glyphFont = ''
  function _syncGlyphW(/** @type {CanvasRenderingContext2D} */ ctx) {
    if (ctx.font === _glyphFont) return
    const a = ctx.measureText('i').width
    const b = ctx.measureText('W').width
    _glyphW = Math.abs(a - b) < 0.1 ? b : 0 // 0 ⇒ not monospace → fall back to measureText
    _glyphFont = ctx.font
  }

  /** Width of `str` under the active font (O(1) for monospace). */
  function textWidth(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {string} */ str) {
    _syncGlyphW(ctx)
    return _glyphW > 0 ? str.length * _glyphW : ctx.measureText(str).width
  }

  /** Truncate `text` to fit `maxW` px under the current ctx.font, adding `…`. */
  function truncText(ctx, text, maxW) {
    if (maxW <= 0) return ''
    const len = text.length
    if (len === 0) return text
    _syncGlyphW(ctx)
    // Fast no-truncation check: if the monospace estimate fits, trust it.
    if (_glyphW > 0 && len * _glyphW <= maxW) return text
    // For truncation, always measure accurately — the monospace estimate can
    // over-count for non-ASCII characters (Arabic, CJK, etc.) that fall back
    // to a narrower font, leaving an apparent gap after the ellipsis.
    if (ctx.measureText(text).width <= maxW) return text
    // Monospace fast path: the slice length is plain arithmetic, verified with a
    // couple of real measurements (non-ASCII glyphs fall back to narrower fonts,
    // so a failed verify drops to the exact binary search below). This replaces
    // ~10 measureText binary-search probes per truncated cell per frame with 2-3.
    if (_glyphW > 0) {
      let k = Math.max(0, Math.min(len - 1, Math.floor(maxW / _glyphW) - 1))
      if (ctx.measureText(text.slice(0, k) + '…').width <= maxW) {
        // Grow greedily while it still fits (covers narrow fallback glyphs);
        // bounded so the worst case stays O(1).
        for (let step = 0; step < 4 && k < len - 1; step++) {
          if (ctx.measureText(text.slice(0, k + 1) + '…').width <= maxW) k++
          else break
        }
        return text.slice(0, k) + '…'
      }
    }
    let lo = 0, hi = len
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
    // Fonts are measured off the live DOM probe, so they already reflect the
    // app zoom (.text-ui-* sizes resolve against --app-font-size). The layout
    // constants (ROW_HEIGHT, HEADER_H, …) scale by the same canvasZoom factor,
    // so text and geometry stay proportional with the rest of the UI. Do NOT
    // multiply the probe fonts by canvasZoom again — that double-scales them.
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
    // Staged-delete diff marker (red — matches the destructive accent).
    const RED = 'rgb(239, 68, 68)'

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = cPanel
    ctx.fillRect(0, 0, W, H)

    const usedW = Math.max(0, Math.min(W, geom.totalWidth - _scrollLeft))
    const navName = focusedCol !== null ? navigableColumns[focusedCol]?.name : null

    // Frozen left region (pinned cols only) — already summed by geometry.
    const frozenW = geom.frozenWidth

    // ── Body ─────────────────────────────────────────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, HEADER_H, W, Math.max(0, H - HEADER_H))
    ctx.clip()
    ctx.textBaseline = 'middle'

    // Precompute the rectangular cell-range (in column-name space) once per frame
    // so drawCell can cheaply tint in-range cells and stroke the range border.
    const range = computeCellRange()
    /** @type {Set<string> | null} */
    let rangeColNames = null
    let rangeFirstCol = '', rangeLastCol = '', rangeR0 = -1, rangeR1 = -1
    if (range) {
      rangeColNames = new Set()
      for (let ci = range.c0; ci <= range.c1; ci++) {
        const nm = navigableColumns[ci]?.name
        if (nm) rangeColNames.add(nm)
      }
      rangeFirstCol = navigableColumns[range.c0]?.name ?? ''
      rangeLastCol = navigableColumns[range.c1]?.name ?? ''
      rangeR0 = range.r0; rangeR1 = range.r1
    }

    // Frame-constant draw context — built ONCE per frame and shared by every
    // visible row, instead of a fresh ~20-field literal per row (that churned
    // thousands of short-lived objects/sec during scroll → GC jank).
    // Grid style preset + its dot size (integer, DPR-agnostic — canvas is already
    // scaled by canvasZoom), resolved once per frame.
    const tableStyle = _tableStyle
    const dotSize = Math.max(2, Math.round(2 * canvasZoom))

    // Vertical separator x-positions are identical for every row (they depend only
    // on columns + scroll, not the row), so collect them ONCE per frame here rather
    // than re-deriving them inside every drawBodyRow. Keeps the per-row grid pass to
    // a single loop over this array — flat regardless of how many million rows exist.
    // Reuse one buffer across frames so the scroll hot path allocates nothing here.
    const vSeps = _vSepsBuf
    vSeps.length = 0
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx >= W) break
      if (dx + col.w <= 0) continue
      const ex = dx + col.w - 0.5
      if (ex <= frozenW) continue
      vSeps.push(ex)
    }
    for (let vi = 0; vi < virtualRelCols.length; vi++) {
      const ex = geom.totalWidth + vexprTotalW + vi * VIRTUAL_COL_W - _scrollLeft + VIRTUAL_COL_W - 0.5
      if (ex <= frozenW || ex >= W) continue
      vSeps.push(ex)
    }
    for (const col of geom.cols) {
      if (!col.pinned) continue
      const ex = colDrawnX(col, geom, _scrollLeft) + col.w - 0.5
      if (ex <= 0 || ex >= W) continue
      vSeps.push(ex)
    }
    if (gutterWidth > 0) {
      const gex = (gutterWidth - _scrollLeft) - 0.5
      if (gex > 0 && gex < W) vSeps.push(gex)
    }

    const bodyC = {
      cFg, cText, cMuted, cGrid, cBorder, cMutedBg, cRing, cAccent, cPanel, usedW, navName,
      AMBER, BLUE_FG, RED, cPrimary, frozenW, tableStyle, dotSize, vSeps,
      rangeColNames, rangeFirstCol, rangeLastCol, rangeR0, rangeR1,
    }

    const bodyTopY = Math.max(0, _scrollTop - HEADER_H - insertRowOffset)
    if (visibleColumns.length > 0) {
      let i = rowIndexAtY(rowTops, n, bodyTopY, ROW_HEIGHT)
      for (; i < n; i++) {
        const ry = rowViewportY(i)
        if (ry >= H) break
        if (ry + ROW_HEIGHT <= HEADER_H) continue
        drawBodyRow(ctx, i, ry, bodyC)
      }
    }
    ctx.restore()

    // ── Header (pinned) — skip entirely when no columns visible ───────────
    if (visibleColumns.length > 0) {
      drawHeaderRow(ctx, {
        W, cPanel, cFg, cMuted, cGrid, cBorder, cMutedBg, cAccent, cPrimary, cRing,
        AMBER, AMBER_FG, BLUE_FG, usedW,
      })
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawBodyRow(ctx, idx, ry, c) {
    const rh = ROW_HEIGHT
    // Row background — selected uses primary tint, others use muted.
    const isSel = selected.has(idx)
    const isPendingDelete = hasPendingDeletes && pendingDeletes.has(idx)
    if (isPendingDelete) {
      // Red diff tint for rows staged for deletion.
      ctx.fillStyle = withAlpha(c.RED, hoveredRow === idx ? 0.2 : 0.14)
      ctx.fillRect(0, ry, c.usedW, rh)
    } else if (isSel) {
      ctx.fillStyle = withAlpha(c.cPrimary, hoveredRow === idx ? 0.18 : 0.13)
      ctx.fillRect(0, ry, c.usedW, rh)
    } else if (focusedRow === idx) {
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.22)
      ctx.fillRect(0, ry, c.usedW, rh)
    } else if (hoveredRow === idx) {
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.18)
      ctx.fillRect(0, ry, c.usedW, rh)
    } else if (c.tableStyle.zebra && (idx & 1)) {
      // Zebra striping — a soft tint on odd rows. Below every interactive state
      // above so selection/hover/focus always win; O(1), no per-row allocation.
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.07)
      ctx.fillRect(0, ry, c.usedW, rh)
    }

    // Non-pinned cells. geom.cols is ordered by ascending contentX, so once a
    // column starts past the right viewport edge every later one does too — break
    // instead of iterating the off-screen tail (matters for very wide tables).
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx >= _viewportWidth) break
      if (dx + col.w <= 0) continue
      drawCell(ctx, idx, col, dx, ry, rh, c)
    }

    // Pinned cells on top (frozen left).
    for (const col of geom.cols) {
      if (!col.pinned) continue
      const dx = colDrawnX(col, geom, _scrollLeft)
      drawCell(ctx, idx, col, dx, ry, rh, c, true)
    }

    drawRowGutters(ctx, idx, -_scrollLeft, ry, rh, c)

    // Staged-delete decoration: a left red bar + a strikethrough across the row.
    if (isPendingDelete) {
      ctx.fillStyle = c.RED
      ctx.fillRect(0, ry, 2, rh)
      ctx.strokeStyle = withAlpha(c.RED, 0.7)
      ctx.lineWidth = 1
      const sy = Math.round(ry + rh / 2) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, sy)
      ctx.lineTo(c.usedW, sy)
      ctx.stroke()
    }

    // Row ring when focused + selected.
    if (focusedRow === idx && isSel) {
      ctx.strokeStyle = withAlpha(c.cPrimary, 0.45)
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, ry + 0.5, c.usedW - 1, rh - 1)
    }

    // ── Virtual expression column cells ──────────────────────────────────────
    if (_vexprLayout.length > 0 && _fonts) {
      for (let vi = 0; vi < _vexprLayout.length; vi++) {
        const vc = _vexprLayout[vi]
        const cellX = vc.x - _scrollLeft
        if (cellX + vc.w <= 0 || cellX >= _viewportWidth) continue
        ctx.fillStyle = c.cPanel
        ctx.fillRect(cellX, ry, vc.w, rh)
        const isVHov = hoveredRow === idx && hoveredColName === vc.hoverKey
        if (isVHov) { ctx.fillStyle = withAlpha(c.cMutedBg, 0.15); ctx.fillRect(cellX, ry, vc.w, rh) }
        if (vi === 0) {
          ctx.strokeStyle = withAlpha(c.cPrimary, 0.18); ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(cellX + 0.5, ry + 4); ctx.lineTo(cellX + 0.5, ry + rh - 4); ctx.stroke()
        }
        const row = rows[idx]
        if (!row) continue
        const val = vexprText(row, vc.fnIdx)
        const isUrl = looksLikeUrl(val)
        ctx.font = _fonts.cell
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = isUrl ? withAlpha(c.cAccent, isVHov ? 1 : 0.85) : withAlpha(c.cFg, 0.75)
        const maxW = vc.w - 20
        ctx.fillText(truncText(ctx, val, maxW), cellX + 10, ry + rh / 2 + 0.5)
      }
    }

    // ── Virtual relationship column cells ─────────────────────────────────────
    // Drawn BEFORE the bottom grid line so the line renders on top of cell fills.
    for (let vi = 0; vi < virtualRelCols.length; vi++) {
      const vc = virtualRelCols[vi]
      const cellX = geom.totalWidth + vexprTotalW + vi * VIRTUAL_COL_W - _scrollLeft
      if (cellX + VIRTUAL_COL_W <= 0 || cellX >= _viewportWidth) continue
      ctx.fillStyle = c.cPanel; ctx.fillRect(cellX, ry, VIRTUAL_COL_W, rh)
      const isActive = fkSubview?.rowIdx === idx && fkSubview?.kind === 'reverse' && fkSubview?.label === vc.label
      const isVHov = hoveredRow === idx && hoveredColName === _vrelHoverKeys[vi]
      if (!_fonts) return

      // Badge: compact tag style — no border at rest, border on hover/active.
      const badgeFontPx = Math.max(10, _fonts.cellPx - 1)
      const bPadX = 10
      const bH = Math.round(badgeFontPx * 1.7)
      const bR = Math.round(bH / 2) // pill — fully rounded, reads as a chip
      ctx.font = `500 ${badgeFontPx}px ${_fonts.family}`

      // Consistent side gutters so the pill is centered with breathing room.
      const gutter = Math.round(14 * canvasZoom)
      const maxLabelW = VIRTUAL_COL_W - gutter * 2 - bPadX * 2
      const labelTxt = truncText(ctx, vc.label, maxLabelW)
      const textW = textWidth(ctx, labelTxt)
      const bW = Math.min(textW + bPadX * 2, VIRTUAL_COL_W - gutter * 2)
      const bX = cellX + (VIRTUAL_COL_W - bW) / 2
      const bY = ry + (rh - bH) / 2

      if (isActive) { ctx.fillStyle = withAlpha(c.cPrimary, 0.05); ctx.fillRect(cellX, ry, VIRTUAL_COL_W, rh) }

      ctx.fillStyle = isActive
        ? withAlpha(c.cPrimary, 0.15)
        : isVHov ? withAlpha(c.cMutedBg, 0.6) : withAlpha(c.cMutedBg, 0.3)
      roundRect(ctx, bX, bY, bW, bH, bR); ctx.fill()

      if (isActive || isVHov) {
        ctx.strokeStyle = isActive ? withAlpha(c.cPrimary, 0.45) : withAlpha(c.cMuted, 0.25)
        ctx.lineWidth = 1
        roundRect(ctx, bX + 0.5, bY + 0.5, bW - 1, bH - 1, bR); ctx.stroke()
      }

      ctx.fillStyle = isActive ? c.cPrimary : withAlpha(c.cFg, 0.72)
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
      ctx.fillText(labelTxt, bX + bW / 2, ry + rh / 2 + 0.5)
    }

    // ── Batched grid pass ───────────────────────────────────────────────────
    // All separators (column edges, virtual edges, gutter, bottom row line) are
    // collected into ONE path and stroked once — instead of a beginPath/stroke
    // per cell. This collapses ~(cols+3) draw-call flushes per row down to one,
    // the single biggest scroll-perf win alongside O(1) text measurement.
    const vw = _viewportWidth
    // Vertical separators were collected once for the frame; the row only chooses
    // how to render them per the active grid-style preset. All branches stay a
    // single batched path/fill, so this is O(visible cols) no matter the row count.
    const ts = c.tableStyle
    const seps = c.vSeps
    // "Bordered" preset draws with the stronger border token for a high-contrast grid.
    const gridColor = ts.strong ? c.cBorder : c.cGrid

    if (ts.dots) {
      // "Connection dot" grid — a small square at each cell join (column separator
      // × the row's bottom edge) instead of full lines. One batched fill per row.
      const ds = c.dotSize
      const dy = ry + rh - ds
      const half = (ds / 2) | 0
      ctx.fillStyle = gridColor
      ctx.beginPath()
      ctx.rect(0, dy, ds, ds) // left edge join
      for (let k = 0; k < seps.length; k++) ctx.rect((seps[k] - half) | 0, dy, ds, ds)
      ctx.fill()
    } else {
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1
      if (ts.dash) ctx.setLineDash(ts.dash)
      ctx.beginPath()
      if (ts.cols) {
        for (let k = 0; k < seps.length; k++) { ctx.moveTo(seps[k], ry); ctx.lineTo(seps[k], ry + rh) }
      }
      if (ts.rows) { ctx.moveTo(0, ry + rh - 0.5); ctx.lineTo(vw, ry + rh - 0.5) }
      ctx.stroke()
      if (ts.dash) ctx.setLineDash([]) // reset so other strokes stay solid
    }
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

    // Extension render directive (badges, tints, masks, links, swatches, …).
    // Computed once per cell and merged across enabled formatters; null/JSON
    // cells skip it entirely so the common path allocates nothing.
    const dir = (_extActive && !isNull && !isJson)
      ? formatCellValue(value, cached?.colType ?? '', col.name, _colStats ? { stats: _colStats.get(actualIdx) } : undefined)
      : null

    // Cell background tints.
    if (!editing) {
      // Column-selection band (drawn first so other tints layer on top).
      if (selectedCols.has(col.name)) {
        ctx.fillStyle = withAlpha(c.cPrimary, 0.08); ctx.fillRect(cellX, ry, w, rh)
      }
      // Focused-column band (drawn first so per-cell tints layer on top).
      if (focusColName !== null && col.name === focusColName) {
        ctx.fillStyle = withAlpha(c.cPrimary, 0.1); ctx.fillRect(cellX, ry, w, rh)
      }
      if (isDirty) { ctx.fillStyle = withAlpha(c.AMBER, 0.15); ctx.fillRect(cellX, ry, w, rh) }
      else if (activeFk) { ctx.fillStyle = withAlpha(c.cAccent, 0.15); ctx.fillRect(cellX, ry, w, rh) }
      // The lone-focused-cell tint is skipped while a range is active so every
      // in-range cell (including the drag-end corner) shares one uniform block tint.
      else if (isFocusedCell && !c.rangeColNames) { ctx.fillStyle = withAlpha(c.cPrimary, 0.08); ctx.fillRect(cellX, ry, w, rh) }
      else if (dir?.bgTint) { ctx.fillStyle = dir.bgTint; ctx.fillRect(cellX, ry, w, rh) }

      // Rectangular range selection — tint every in-range cell + stroke the outer border.
      const inRange = c.rangeColNames && idx >= c.rangeR0 && idx <= c.rangeR1 && c.rangeColNames.has(col.name)
      if (inRange) {
        ctx.fillStyle = withAlpha(c.cPrimary, 0.16); ctx.fillRect(cellX, ry, w, rh)
        ctx.strokeStyle = withAlpha(c.cPrimary, 0.9)
        ctx.lineWidth = 1
        ctx.beginPath()
        if (idx === c.rangeR0) { ctx.moveTo(cellX, ry + 0.5); ctx.lineTo(cellX + w, ry + 0.5) }
        if (idx === c.rangeR1) { ctx.moveTo(cellX, ry + rh - 0.5); ctx.lineTo(cellX + w, ry + rh - 0.5) }
        if (col.name === c.rangeFirstCol) { ctx.moveTo(cellX + 0.5, ry); ctx.lineTo(cellX + 0.5, ry + rh) }
        if (col.name === c.rangeLastCol) { ctx.moveTo(cellX + w - 0.5, ry); ctx.lineTo(cellX + w - 0.5, ry + rh) }
        ctx.stroke()
      }
    } else {
      // Active edit cell — the DOM overlay draws its own ring-inset; no canvas
      // border needed here (a canvas strokeRect would bleed outside the cell on
      // the right/bottom edges and create a misaligned double-border with the DOM ring).
    }

    // (Vertical grid separators are batched once per row in drawBodyRow.)

    // Dirty inset marker.
    if (isDirty && !editing) {
      ctx.fillStyle = c.AMBER
      ctx.fillRect(cellX, ry, 2, rh)
    }

    if (editing) return // text drawn by the DOM overlay

    const rowHover = hoveredRow === idx
    const isHover = rowHover && hoveredColName === col.name
    const canExpand = (cached?.canEdit ?? false) && !cached?.enumValues && !isBooleanType(cached?.colType ?? '')
    const cy = ry + rh / 2

    // Cell text — directive display wins; masked cells reveal on hover.
    const revealed = dir?.mask && isHover
    // SQL array columns render pgAdmin-style ({a,b}); jsonb arrays stay JSON.
    const isArrayCol = Array.isArray(value) && isSqlArrayType(cached?.colType)
    // A per-column transform (chosen from the header menu) renders its result
    // live and wins over formatter directives; skipped for staged/editing cells.
    const colTf = (!staged && rows[idx]) ? _colTransformFns[col.name] : undefined
    const text = colTf
      ? colTransformText(rows[idx], actualIdx, value, colTf)
      : dir
        ? String(revealed ? (dir.reveal ?? dir.display) : (dir.display ?? displayCell(value)))
        : isArrayCol
          ? arrayDisplay(value)
          : staged || !rows[idx]
            ? displayCell(value)
            : cellDisplayText(rows[idx], actualIdx, value)

    // Text color — directive link/fg may override (but never over a stronger
    // dirty/fk/focused state highlight).
    let textColor = isFocusedCell || isDirty || activeFk ? c.cFg
      : isNull ? c.cMuted
      : c.cText
    if (dir?.link) textColor = c.cAccent
    else if (dir?.fg && !isFocusedCell && !isDirty && !activeFk) textColor = dir.fg

    // Right-side content widths (sequential, no overlap).
    const warnW = dir?.warn ? Math.round(14 * canvasZoom) : 0
    const hoverW = isHover ? ICON_HIT + (canExpand ? ICON_HIT : 0) : 0
    const fkW = (activeFk && rowHover) ? 20 : 0
    const jsonW = isJson ? Math.round(36 * canvasZoom) : 0
    const rightReserve = 4 + hoverW + fkW + jsonW + warnW  // 4 = right margin

    // Left-side decorations (color swatch / boolean dot) push the text right.
    let textX = cellX + CELL_PAD_X
    let leftPad = 0
    if (dir?.swatch) {
      const sw = Math.round(11 * canvasZoom)
      roundRect(ctx, textX, cy - sw / 2, sw, sw, Math.round(2.5 * canvasZoom))
      ctx.fillStyle = dir.swatch; ctx.fill()
      ctx.strokeStyle = withAlpha(c.cBorder, 0.6); ctx.lineWidth = 1
      roundRect(ctx, textX, cy - sw / 2, sw, sw, Math.round(2.5 * canvasZoom)); ctx.stroke()
      leftPad = sw + Math.round(7 * canvasZoom)
    } else if (dir?.dot) {
      const dr = Math.round(7 * canvasZoom)
      ctx.fillStyle = dir.dot
      ctx.beginPath(); ctx.arc(textX + dr / 2, cy, dr / 2, 0, Math.PI * 2); ctx.fill()
      leftPad = dr + Math.round(7 * canvasZoom)
    }
    textX += leftPad
    const textMaxW = w - CELL_PAD_X - leftPad - rightReserve

    ctx.font = _fonts.cell
    ctx.textAlign = 'left'
    if (dir?.badge) {
      // Status pill — label inside a rounded, tinted capsule.
      const padX = Math.round(7 * canvasZoom)
      const label = truncText(ctx, text, Math.max(0, textMaxW - padX * 2))
      const pillH = Math.min(rh - Math.round(6 * canvasZoom), Math.round(17 * canvasZoom))
      const pillW = Math.min(Math.max(0, textMaxW), textWidth(ctx, label) + padX * 2)
      const py = ry + (rh - pillH) / 2
      roundRect(ctx, textX, py, pillW, pillH, pillH / 2)
      ctx.fillStyle = dir.badge.bg; ctx.fill()
      ctx.fillStyle = dir.badge.fg
      ctx.fillText(label, textX + padX, cy + 0.5)
    } else {
      const drawn = truncText(ctx, text, Math.max(0, textMaxW))
      if (_searchLower && !isNull) drawSearchHighlights(ctx, drawn, textX, ry, rh, c)
      ctx.fillStyle = textColor
      ctx.fillText(drawn, textX, cy + 0.5)
      if (dir?.link) {
        const uy = cy + Math.round(7 * canvasZoom)
        const uw = Math.min(textWidth(ctx, drawn), Math.max(0, textMaxW))
        ctx.strokeStyle = withAlpha(textColor, 0.5); ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(textX, uy); ctx.lineTo(textX + uw, uy); ctx.stroke()
      }
    }

    // Draw right-side items right-to-left with a running cursor.
    let rx = cellX + w - 4  // 4px right margin

    // 0. Validation warning marker (amber dot).
    if (dir?.warn) {
      const wr = Math.round(4 * canvasZoom)
      ctx.fillStyle = withAlpha(c.AMBER, 0.95)
      ctx.beginPath(); ctx.arc(rx - wr, cy, wr, 0, Math.PI * 2); ctx.fill()
      rx -= warnW
    }

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

    // 3. JSON pill — braces icon + "JSON" label laid out left-to-right with a
    //    real gap, pill width measured from the label so the two never collide
    //    (the old fixed 30px pill overlapped the icon and the text).
    if (isJson) {
      const pillH = Math.round(15 * canvasZoom)
      const padX = Math.round(5 * canvasZoom)
      const gap = Math.round(3 * canvasZoom)
      const iconSz = Math.round(10 * canvasZoom)
      const pillFontPx = Math.max(8, Math.round(9 * canvasZoom))
      ctx.font = `600 ${pillFontPx}px ${_fonts.family}`
      ctx.textAlign = 'left'
      const labelW = textWidth(ctx, 'JSON')
      const pillW = padX + iconSz + gap + labelW + padX
      const px = rx - 2 - pillW
      const py = ry + (rh - pillH) / 2
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.6)
      roundRect(ctx, px, py, pillW, pillH, Math.round(4 * canvasZoom)); ctx.fill()
      drawIcon(ctx, 'braces', px + padX, cy - iconSz / 2, iconSz, withAlpha(c.cMuted, 0.85), 2)
      ctx.fillStyle = c.cMuted
      ctx.fillText('JSON', px + padX + iconSz + gap, cy + 0.5)
    }

    // Focused-cell outline — primary border, fully inset (no bleed to neighbours).
    // +1.5 offset keeps the 2px stroke's outer edge 0.5px inside the cell boundary
    // on all four sides, so left=top=right=bottom are visually symmetric.
    // Suppressed while a rectangular range is active — the range's own outline is
    // the selection indicator, and a per-cell ring on the drag-end cell reads as a
    // stray highlight inside the block.
    if (isFocusedCell && !c.rangeColNames) {
      ctx.strokeStyle = withAlpha(c.cPrimary, 0.9)
      ctx.lineWidth = 2
      ctx.strokeRect(cellX + 1.5, ry + 1.5, w - 3, rh - 3)
    }
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} offsetX scroll-adjusted left offset */
  function drawRowGutters(ctx, idx, offsetX, ry, rh, c) {
    if (gutterWidth <= 0) return
    const isPendingDelete = hasPendingDeletes && pendingDeletes.has(idx)
    ctx.fillStyle = c.cPanel
    ctx.fillRect(offsetX, ry, gutterWidth, rh)
    if (isPendingDelete) {
      // Red diff tint over the gutter so the marker reads on the same band.
      ctx.fillStyle = withAlpha(c.RED, hoveredRow === idx ? 0.2 : 0.14)
      ctx.fillRect(offsetX, ry, gutterWidth, rh)
    }
    let gx = offsetX
    if (showRowExpand) {
      if (isPendingDelete) {
        // A red minus in place of the expand chevron marks the staged deletion.
        ctx.strokeStyle = c.RED
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        const cx = gx + GUTTER_EXPAND_W / 2
        const cy = Math.round(ry + rh / 2) + 0.5
        ctx.beginPath()
        ctx.moveTo(cx - 5, cy)
        ctx.lineTo(cx + 5, cy)
        ctx.stroke()
      } else {
        const expanded = expandedRows.has(idx) || fkSubview?.rowIdx === idx
        const hov = hoveredRow === idx
        if (expanded || hov) {
          drawIcon(ctx, expanded ? 'chevron-down' : 'chevron-right',
            gx + (GUTTER_EXPAND_W - 14) / 2, ry + (rh - 14) / 2, 14,
            expanded ? c.cFg : c.cMuted, 2)
        }
      }
      gx += GUTTER_EXPAND_W
    }
    if (showSelection) {
      drawCheckbox(ctx, gx + (GUTTER_SELECT_W - 16) / 2, ry + (rh - 16) / 2, 16,
        { checked: selected.has(idx) },
        { border: c.cMuted, fill: c.cPrimary, mark: c.cPanel })
      gx += GUTTER_SELECT_W
    }
    // (Gutter separator is batched once per row in drawBodyRow.)
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawHeaderRow(ctx, c) {
    // Distinct header background — panel base + muted overlay for clear separation from body rows.
    ctx.fillStyle = c.cPanel
    ctx.fillRect(0, 0, c.W, HEADER_H)
    ctx.fillStyle = withAlpha(c.cMutedBg, 0.38)
    ctx.fillRect(0, 0, c.W, HEADER_H)

    // Non-pinned headers. Ordered by ascending contentX → break past the right edge.
    for (const col of geom.cols) {
      if (col.pinned) continue
      const dx = col.contentX - _scrollLeft
      if (dx >= c.W) break
      if (dx + col.w <= 0) continue
      drawHeaderCell(ctx, col, dx, c)
    }

    // Pinned headers.
    for (const col of geom.cols) {
      if (!col.pinned) continue
      drawHeaderCell(ctx, col, colDrawnX(col, geom, _scrollLeft), c)
    }

    if (gutterWidth > 0) {
      const gx0 = -_scrollLeft
      ctx.fillStyle = c.cPanel
      ctx.fillRect(gx0, 0, gutterWidth, HEADER_H)
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.38)
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

    // Virtual expression column headers
    if (_vexprLayout.length > 0 && _fonts) {
      for (let vi = 0; vi < _vexprLayout.length; vi++) {
        const vc = _vexprLayout[vi]
        const vcKey = `__vcol__${vc.id}`
        const x = vc.x - _scrollLeft
        if (x + vc.w <= 0 || x >= c.W) continue
        // Header bg — slightly tinted to distinguish from real cols
        ctx.fillStyle = withAlpha(c.cMutedBg, resizingColName === vcKey ? 0.25 : 0.12)
        ctx.fillRect(x, 0, vc.w, HEADER_H)
        // Left accent line for first col
        if (vi === 0) {
          ctx.strokeStyle = withAlpha(c.cPrimary, 0.3); ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(x + 1, 4); ctx.lineTo(x + 1, HEADER_H - 4); ctx.stroke()
        }
        // Right border
        ctx.strokeStyle = c.cGrid; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + vc.w - 0.5, 0); ctx.lineTo(x + vc.w - 0.5, HEADER_H); ctx.stroke()
        // "ƒ" indicator + name
        ctx.font = _fonts.header
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = withAlpha(c.cPrimary, 0.5)
        ctx.fillText('ƒ', x + 8, HEADER_H / 2 + 0.5)
        const fW = ctx.measureText('ƒ ').width
        ctx.fillStyle = withAlpha(c.cFg, 0.7)
        ctx.fillText(truncText(ctx, vc.name, vc.w - fW - 24), x + 8 + fW, HEADER_H / 2 + 0.5)
        // Resize affordance
        if (_resizeHoverCol === vcKey || resizingColName === vcKey) {
          ctx.strokeStyle = withAlpha(c.cPrimary, 0.7); ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(x + vc.w - 1, 5); ctx.lineTo(x + vc.w - 1, HEADER_H - 5); ctx.stroke()
        }
      }
    }

    // Virtual relationship column headers
    for (let vi = 0; vi < virtualRelCols.length; vi++) {
      const vc = virtualRelCols[vi]
      const vrelKey = `__vrel__${vi}`
      const x = geom.totalWidth + vexprTotalW + vi * VIRTUAL_COL_W - _scrollLeft
      if (x + VIRTUAL_COL_W <= 0 || x >= c.W) continue
      ctx.fillStyle = withAlpha(c.cMutedBg, resizingColName === vrelKey ? 0.25 : 0.1)
      ctx.fillRect(x, 0, VIRTUAL_COL_W, HEADER_H)
      if (vi === 0) {
        ctx.strokeStyle = withAlpha(c.cPrimary, 0.25); ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x + 1, 4); ctx.lineTo(x + 1, HEADER_H - 4); ctx.stroke()
      }
      ctx.strokeStyle = c.cGrid; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + VIRTUAL_COL_W - 0.5, 0); ctx.lineTo(x + VIRTUAL_COL_W - 0.5, HEADER_H); ctx.stroke()
      if (!_fonts) continue
      ctx.font = _fonts.header; ctx.fillStyle = withAlpha(c.cMuted, 0.6)
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(truncText(ctx, vc.label, VIRTUAL_COL_W - 16), x + 8, HEADER_H / 2 + 0.5)
      // Resize edge affordance (matches regular column behaviour)
      if (_resizeHoverCol === vrelKey || resizingColName === vrelKey) {
        ctx.strokeStyle = withAlpha(c.cPrimary, 0.7)
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x + VIRTUAL_COL_W - 1, 5); ctx.lineTo(x + VIRTUAL_COL_W - 1, HEADER_H - 5); ctx.stroke()
      }
    }

    // Header bottom border — kept subtle (not a hard divider).
    ctx.strokeStyle = withAlpha(c.cBorder, 0.3)
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, HEADER_H - 0.5); ctx.lineTo(c.W, HEADER_H - 0.5); ctx.stroke()
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawHeaderCell(ctx, col, x, c) {
    const w = col.w

    const sortInfo = _sortLookup.get(col.name)
    const sorted = !!sortInfo

    // Pinned headers are painted on top of scrolled columns — give them an opaque
    // backing so the columns sliding underneath don't bleed through.
    if (col.pinned) {
      ctx.fillStyle = c.cPanel; ctx.fillRect(x, 0, w, HEADER_H)
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.38); ctx.fillRect(x, 0, w, HEADER_H)
    }

    // Persistent per-column highlight colour (chosen from the header menu).
    const _hl = colHighlights[col.name]
    const _hlHex = _hl?.color ? COL_HL_MAP.get(_hl.color) : undefined
    if (_hlHex) {
      ctx.fillStyle = withAlpha(_hlHex, 0.13); ctx.fillRect(x, 0, w, HEADER_H)
      ctx.fillStyle = withAlpha(_hlHex, 0.85); ctx.fillRect(x, HEADER_H - 2, w, 2)
    }

    // Per-column transform indicator — faint primary wash + accent underline so
    // it's clear this column's values are being transformed live.
    if (colTransforms[col.name]) {
      ctx.fillStyle = withAlpha(c.cPrimary, 0.10); ctx.fillRect(x, 0, w, HEADER_H)
      ctx.fillStyle = withAlpha(c.cPrimary, 0.7); ctx.fillRect(x, HEADER_H - 2, w, 2)
    }

    // Background tint.
    if (resizingColName === col.name) { ctx.fillStyle = withAlpha(c.cPrimary, 0.08); ctx.fillRect(x, 0, w, HEADER_H) }
    else if (sorted) { ctx.fillStyle = withAlpha(c.cPrimary, 0.05); ctx.fillRect(x, 0, w, HEADER_H) }
    else if (hoveredColName === col.name && hoveredRow === null && _resizeHoverCol !== col.name) {
      ctx.fillStyle = withAlpha(c.cMutedBg, 0.25); ctx.fillRect(x, 0, w, HEADER_H)
    }

    // Focused-column highlight (toolbar "Jump to column") — tint + accent underline.
    if (focusColName === col.name) {
      ctx.fillStyle = withAlpha(c.cPrimary, 0.18); ctx.fillRect(x, 0, w, HEADER_H)
      ctx.fillStyle = withAlpha(c.cPrimary, 0.9); ctx.fillRect(x, HEADER_H - 2, w, 2)
    }

    // Column-selection highlight (shift+click range) — stronger tint + thick underline.
    if (selectedCols.has(col.name)) {
      ctx.fillStyle = withAlpha(c.cPrimary, 0.22); ctx.fillRect(x, 0, w, HEADER_H)
      ctx.fillStyle = c.cPrimary; ctx.fillRect(x, HEADER_H - 3, w, 3)
    }

    // Right grid separator.
    ctx.strokeStyle = withAlpha(c.cBorder, 0.25)
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + w - 0.5, 0); ctx.lineTo(x + w - 0.5, HEADER_H); ctx.stroke()

    const meta = colMeta.get(col.name)
    const cy = HEADER_H / 2
    // Reserve enough room on the right that the sort glyph keeps a clear margin
    // from both the edge and the type text.
    const SORT_ICON = 13
    const SORT_MARGIN_R = 9
    const sortReserve = SORT_ICON + SORT_MARGIN_R + 4
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    // Relational indicators — a small amber key (PK) and blue link (FK) glyph
    // read more cleanly than lettered boxes and keep the colour coding.
    const indicators = []
    if (meta) {
      if (meta.pk) indicators.push({ icon: 'key-round', color: c.AMBER_FG })
      if (meta.fk) indicators.push({ icon: 'link-2', color: c.BLUE_FG })
    }
    const indReserve = indicators.length * 18

    // Column name — primary, medium weight.
    ctx.font = _fonts.header
    ctx.fillStyle = withAlpha(c.cFg, sorted ? 1 : 0.9)
    const nameMaxW = w - CELL_PAD_X - sortReserve - indReserve - 8
    const name = truncText(ctx, col.name, Math.max(0, nameMaxW))
    ctx.fillText(name, x + CELL_PAD_X, cy + 0.5)
    let tx = x + CELL_PAD_X + textWidth(ctx, name) + 7

    // PK / FK glyphs (vertically centred, accent-coloured).
    for (const ind of indicators) {
      drawIcon(ctx, ind.icon, tx, cy - 6.5, 13, ind.color, 1.5)
      tx += 18
    }

    // Optional column tag — a bordered chip after the name, tinted with the
    // column's highlight colour (or muted when none). The 1px hue border keeps the
    // chip crisp even when it sits on a same-hue header band. Only drawn with room.
    const _tag = _hl?.tag
    if (_tag) {
      ctx.font = _fonts.type
      const _tw = Math.ceil(textWidth(ctx, _tag))
      const _padX = 9, _pillH = 18, _pillW = _tw + _padX * 2, _r = _pillH / 2
      if (x + w - sortReserve - tx > _pillW + 8) {
        const _tagHex = _hlHex ?? c.cMuted
        const _py = Math.round(cy - _pillH / 2)
        // Soft filled badge (shadcn "secondary/destructive" style): a solid tinted
        // fill with hue text and no border — fully rounded.
        ctx.fillStyle = withAlpha(_tagHex, 0.2)
        roundRect(ctx, tx, _py, _pillW, _pillH, _r); ctx.fill()
        ctx.fillStyle = withAlpha(_tagHex, 1)
        ctx.textAlign = 'left'
        ctx.fillText(_tag, tx + _padX, cy + 0.5)
        tx += _pillW + 8
      }
    }

    // Inline datatype — secondary, lower contrast, a touch of breathing room.
    const typeStartX = tx + (indicators.length ? 5 : 3)
    const typeRoom = x + w - sortReserve - typeStartX
    if (typeRoom > 24 && col.dataType) {
      ctx.font = _fonts.type
      ctx.fillStyle = withAlpha(c.cMuted, 0.6)
      ctx.fillText(truncText(ctx, col.dataType, typeRoom), typeStartX, cy + 0.5)
    }

    // Sort indicator — right-aligned with a clear margin, vertically centred.
    const sortX = x + w - SORT_ICON - SORT_MARGIN_R
    const sortY = cy - SORT_ICON / 2
    if (sorted) {
      const iconName = sortInfo.direction === 'asc' ? 'arrow-up' : 'arrow-down'
      drawIcon(ctx, iconName, sortX, sortY, SORT_ICON, withAlpha(c.cPrimary, 0.95), 1.7)
      // Multi-column sort: show this key's priority (1,2,3…) left of the arrow.
      if (sortInfo.total > 1) {
        ctx.font = `600 ${Math.round(9 * canvasZoom)}px ${_fonts.family}`
        ctx.textAlign = 'right'
        ctx.fillStyle = withAlpha(c.cPrimary, 0.95)
        ctx.fillText(String(sortInfo.index + 1), sortX - Math.round(1.5 * canvasZoom), cy + 0.5)
        ctx.textAlign = 'left'
      }
    } else if (_resizeHoverCol !== col.name && hoveredColName === col.name && hoveredRow === null) {
      drawIcon(ctx, 'chevrons-up-down', sortX, sortY, SORT_ICON, withAlpha(c.cMuted, 0.55), 1.6)
    }

    // Column annotator strip — mini histogram (numeric) or non-null fill bar.
    if (_colStats && annotatorEnabled()) {
      const st = _colStats.get(_nameToActualIdx.get(col.name) ?? -1)
      const stripH = Math.round(6 * canvasZoom)
      const sx = x + 4, sw = w - 8
      const sy = HEADER_H - stripH - 1
      if (st && sw > 8) {
        if (st.numeric && st.hist && st.max > st.min) {
          let maxCount = 0
          for (let i = 0; i < st.hist.length; i++) if (st.hist[i] > maxCount) maxCount = st.hist[i]
          if (maxCount > 0) {
            const bw = sw / st.hist.length
            ctx.fillStyle = withAlpha(c.cPrimary, 0.5)
            for (let i = 0; i < st.hist.length; i++) {
              if (!st.hist[i]) continue
              const bh = Math.max(1, (st.hist[i] / maxCount) * stripH)
              ctx.fillRect(sx + i * bw, sy + (stripH - bh), Math.max(1, bw - 1), bh)
            }
          }
        } else if (st.total > 0) {
          const ratio = (st.total - st.nulls) / st.total
          const barY = sy + stripH - 2
          ctx.fillStyle = withAlpha(c.cMutedBg, 0.5); ctx.fillRect(sx, barY, sw, 2)
          ctx.fillStyle = withAlpha(c.cPrimary, 0.45); ctx.fillRect(sx, barY, sw * ratio, 2)
        }
      }
    }

    // Resize-edge affordance.
    if (_resizeHoverCol === col.name || resizingColName === col.name) {
      ctx.strokeStyle = withAlpha(c.cPrimary, 0.8)
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x + w - 1, 4); ctx.lineTo(x + w - 1, HEADER_H - 4); ctx.stroke()
    }
  }

  /** Size the canvas backing store (DPR-aware). Always sync CSS px size so macOS
   *  WebKit can't display a stale CSS box over a mismatched bitmap (blurry zoom).
   *  Called only from the (low-frequency) layout effect — interaction repaints go
   *  through the separate repaint effect — so it always re-applies the transform
   *  rather than short-circuiting on unchanged dimensions. That guarantees the
   *  visible canvas is transformed + painted on every mount / tab switch (a
   *  short-circuit here risked leaving a fresh canvas untransformed → blank). */
  function syncCanvasSurface() {
    const canvas = canvasEl
    const probe = colorProbe
    if (!canvas || !probe) return false
    if (!_readColor) _readColor = createColorReader(probe)
    // ALWAYS (re)fetch the context for the CURRENT canvas element. getContext is
    // idempotent per element (returns the same object), so this is cheap — but if
    // Svelte recreated the <canvas> (it does across tab switches while this
    // instance persists), a cached _ctx would keep painting the OLD, detached
    // canvas and the visible one would stay black. Binding to canvasEl every call
    // keeps _ctx and the on-screen canvas in lockstep.
    _ctx = canvas.getContext('2d')
    const cssW = Math.max(1, Math.round(_viewportWidth))
    const cssH = Math.max(1, Math.round(_viewportHeight))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const bw = Math.max(1, Math.round(cssW * dpr))
    const bh = Math.max(1, Math.round(cssH * dpr))
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    // Only touch canvas.width/height when it actually changes — assigning clears
    // the canvas, and we want to avoid a redundant clear on every repaint.
    let resized = false
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
      resized = true
    }
    // canvas.width/height assignment resets the transform, so always (re)apply it.
    if (_ctx) _ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { ok: !!_ctx, resized }
  }

  // ── Crash containment ───────────────────────────────────────────────────
  // The draw loop and canvas event handlers run outside Svelte's effect tree
  // (rAF callbacks / DOM events), so an exception there bypasses the tab's
  // <svelte:boundary> — the grid would freeze with no error UI and keep
  // throwing every frame. Capture the first such error and rethrow it from an
  // effect, which IS inside the boundary: the per-tab error card ("Reload this
  // view") takes over this tab only, and the rest of the app stays alive.
  let _fatalError = $state(/** @type {unknown} */ (null))
  function reportFatal(/** @type {unknown} */ err) {
    console.error('[DataTable] fatal error:', err)
    if (_fatalError === null) _fatalError = err ?? new Error('Unknown table error')
  }
  $effect(() => {
    const e = _fatalError
    if (e) throw e instanceof Error ? e : new Error(String(e))
  })
  /** Wrap a canvas event handler so a crash fails this tab, not the app.
   * @template {(...args: any[]) => any} F @param {F} fn @returns {F} */
  function guarded(fn) {
    return /** @type {F} */ ((/** @type {any[]} */ ...args) => {
      try {
        return fn(...args)
      } catch (err) {
        reportFatal(err)
      }
    })
  }

  // rAF-batched paint — coalesces bursts of scroll/state changes into a single
  // draw per animation frame so high-frequency trackpad scroll (up to 120Hz on
  // ProMotion) never queues multiple synchronous repaints and tears/janks.
  let _drawRafId = 0
  function scheduleDraw() {
    if (_drawRafId) return
    _drawRafId = requestAnimationFrame(() => {
      _drawRafId = 0
      if (!_ctx || _fatalError) return
      try {
        draw()
      } catch (err) {
        reportFatal(err)
      }
    })
  }
  onDestroy(() => {
    if (_drawRafId) cancelAnimationFrame(_drawRafId)
    if (_resizeRafId) cancelAnimationFrame(_resizeRafId)
    if (_scrollLoopId) cancelAnimationFrame(_scrollLoopId)
  })

  // End a drag-select on pointer-up anywhere (the release often lands outside the
  // canvas). Registered on window so it fires regardless of where the pointer is.
  $effect(() => {
    const up = () => onCanvasPointerUp()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  })

  // Shift+wheel → horizontal scroll. Non-passive so we can call preventDefault,
  // but bails out immediately on non-Shift events so the compositor waits <0.05ms.
  // Registered via $effect (not onwheel attribute) to keep the Svelte template
  // free of any non-passive wheel binding, which would otherwise force the
  // compositor to consult JS on every 120Hz trackpad tick.
  $effect(() => {
    const el = tableContainer
    if (!el) return
    // Accumulates pinch/ctrl-wheel delta so many small gesture ticks map to whole
    // app-zoom steps instead of one step per event.
    let _zoomAccum = 0
    const onShiftWheel = (/** @type {WheelEvent} */ e) => {
      // Trackpad pinch (and ctrl+wheel) arrive as wheel events with ctrlKey=true.
      // Left unhandled, WebKit page-zooms the whole webview — which bitmap-scales
      // the canvas and makes the grid text blurry. Intercept it and drive the app's
      // own (crisp, re-rendered) zoom instead, keeping the native page zoom at 1.
      if (e.ctrlKey) {
        e.preventDefault()
        _zoomAccum += e.deltaY
        while (_zoomAccum <= -24) { increaseZoom(); _zoomAccum += 24 }
        while (_zoomAccum >= 24) { decreaseZoom(); _zoomAccum -= 24 }
        return
      }
      if (!e.shiftKey) return
      const delta = e.deltaY || e.deltaX
      if (!delta) return
      // If the pointer is over a nested horizontally-scrollable panel (the FK
      // sub-view), scroll that instead of the main grid — otherwise shift+scroll
      // over the sub-view would move the table underneath it.
      const inner = e.target instanceof Element
        ? e.target.closest('[data-fk-subview-scroll]')
        : null
      if (inner && inner !== el && inner.scrollWidth > inner.clientWidth) {
        e.preventDefault()
        inner.scrollLeft += delta
        return
      }
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener('wheel', onShiftWheel, { passive: false })
    return () => el.removeEventListener('wheel', onShiftWheel)
  })

  // Canvas element binding — Svelte can recreate the <canvas> across tab switches
  // while this component instance (and its cached _ctx) persist. When the element
  // identity changes, immediately re-bind the context, re-apply size + transform,
  // and repaint the NEW element — otherwise draws keep hitting the old, detached
  // canvas and the visible grid stays black. Tracks canvasEl only.
  $effect(() => {
    const el = canvasEl
    if (!el) { _ctx = null; return }
    if (_ctx?.canvas === el) return // already bound to this element
    const { ok } = syncCanvasSurface()
    if (ok) draw()
  })

  // Layout / sizing effect — resize the backing store when geometry or viewport
  // changes. Tracks ONLY dependencies that can change the canvas dimensions,
  // geometry, or the full set of drawn data. Interaction state (selection, focus,
  // edit, hover, staged edits) is intentionally NOT tracked here — it can never
  // change canvas dimensions, so it lives in the lightweight repaint effect below.
  // Keeping it out means arrow-key nav and drag-select don't re-run the resurface
  // dependency graph or touch the backing store on every tick.
  $effect(() => {
    void rows; void columns; void columnWidths
    void pinnedColumns; void hiddenColumns
    void rowSort; void _viewportWidth
    // NOTE: _scrollTop / _scrollLeft are intentionally NOT tracked here — scrolling
    // repaints via scheduleDraw() inside onContainerScroll, so this effect (which
    // also re-syncs the canvas backing store) doesn't run on every scroll frame.
    void _viewportHeight; void newRowDrafts; void colMeta
    void geom; void rowTops; void _redrawToken; void foreignKeys; void indexes
    void _colCache; void expandedRows; void expandedRowHeights; void virtualRelCols; void VIRTUAL_COL_W
    void vexprTotalW; void _vcolFns
    void zoomState.value; void canvasZoom
    const { ok } = syncCanvasSurface()
    if (ok) {
      // Always paint synchronously in this microtask (not only when the backing
      // store was resized) so a fresh mount / tab switch never composites an
      // untransformed, unpainted canvas (which would show the dark app background
      // as a "black" grid). scheduleDraw() still coalesces concurrent updates.
      draw()
      scheduleDraw()
    }
  })

  // Repaint effect — interaction/visual state that changes what's drawn but never
  // the canvas dimensions. A plain scheduleDraw() (rAF-coalesced) with no backing-
  // store work, so hover/selection/focus/edit stay cheap even during drag-select.
  $effect(() => {
    void hoveredRow; void hoveredColName; void _resizeHoverCol; void resizingColName
    void selected; void focusedRow; void focusedCol; void selAnchor; void editingCell
    void pendingEdits; void pendingDeletes; void insertSaving; void fkSubview
    if (_ctx) scheduleDraw()
  })

  // ── Canvas pointer interaction ──────────────────────────────────────────
  // The canvas element doesn't move while the pointer hovers — only scrolling,
  // resizing or zooming can shift it. So we cache its bounding rect and reuse it
  // across the many pointermove events, instead of forcing a layout reflow with
  // getBoundingClientRect() on every single move. Invalidated on scroll/resize.
  /** @type {DOMRect | null} */
  let _canvasRect = null
  function invalidateCanvasRect() { _canvasRect = null }
  function canvasXY(/** @type {{ clientX: number, clientY: number }} */ e) {
    let r = _canvasRect
    if (!r) {
      r = canvasEl?.getBoundingClientRect() ?? null
      _canvasRect = r
    }
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

    // Check virtual expression column clicks
    if (y >= HEADER_H && _vexprLayout.length > 0) {
      const cx = x + _scrollLeft
      for (let vi = 0; vi < _vexprLayout.length; vi++) {
        const vc = _vexprLayout[vi]
        if (cx >= vc.x && cx < vc.x + vc.w) {
          const bodyY = y + _scrollTop - HEADER_H - insertRowOffset
          const r = rowAtContentY(rowTops, rows.length, ROW_HEIGHT, bodyY)
          if (!r?.inRowBody) return
          const row = rows[r.idx]
          if (!row) return
          const fn = _vcolFns[vc.fnIdx]
          const val = fn ? fn(row) : ''
          if (looksLikeUrl(val)) {
            void import('@tauri-apps/plugin-opener').then(m => m.openUrl(val)).catch(() => {})
          } else if (val) {
            void navigator.clipboard.writeText(val).catch(() => {})
          }
          return
        }
      }
    }
    // Check virtual relationship column clicks (right of real columns)
    if (y >= HEADER_H && virtualRelCols.length > 0) {
      const cx = x + _scrollLeft
      const vOffset = cx - geom.totalWidth - vexprTotalW
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
        if (e.shiftKey) {
          // Shift+click adds/toggles this column as a SECONDARY sort key
          // (multi-column sort), the standard data-grid gesture.
          handleHeaderSort(t.col.name, true)
        } else {
          selectedCols = new Set([t.col.name])
          _lastHeaderClickedCol = t.col.name
          handleHeaderSort(t.col.name, false)
        }
        scheduleDraw()
        return
      }
      case 'row-expand': toggleRowExpand(/** @type {number} */ (t.idx)); return
      case 'row-select': handleRowSelect(/** @type {number} */ (t.idx), e.shiftKey); return
      case 'cell': {
        const idx = /** @type {number} */ (t.idx)
        const actualIdx = /** @type {number} */ (t.actualIdx)

        if (e.shiftKey && selectedCols.size && t.col) {
          // Shift+click body cell while cols selected → extend column range.
          extendColSelection(t.col.name)
          scheduleDraw()
          return
        }
        if (selectedCols.size) {
          selectedCols = new Set()
          _lastHeaderClickedCol = null
          scheduleDraw()
        }
        if (editingCell) cancelEdit()

        // Shift+Click range selection is DISABLED (no current use). The `false &&`
        // keeps the block intact for easy re-enable; shift+click now falls through
        // to plain single-cell focus below.
        if (false && e.shiftKey) {
          const vi2 = actualToVisColIdx(actualIdx)
          if (vi2 >= 0) {
            if (selAnchor === null) {
              selAnchor = (focusedRow !== null && focusedCol !== null)
                ? { row: focusedRow, col: focusedCol }
                : { row: idx, col: vi2 }
            }
            focusedRow = idx
            focusedCol = vi2
            scheduleDraw()
          }
          tableContainer?.focus({ preventScroll: true })
          return
        }

        clearCellRange() // plain click collapses any rectangular range
        focusedRow = idx
        const vi = actualToVisColIdx(actualIdx)
        if (vi >= 0) focusedCol = vi
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
          // Linkifier extension → deep-link an ID to an external system.
          if (!isNull) {
            const linked = linkifyValue(value, cached?.colType ?? '', t.col.name)
            if (linked) { void openExternal(linked); return }
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

  /** Swallow pinch/scroll zoom on resize handles; reset stray webview page-zoom. */
  function blockPointerZoom(/** @type {Event} */ e) {
    e.preventDefault()
    e.stopPropagation()
    void import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(1))
      .catch(() => {})
  }

  /** @param {PointerEvent} e @param {string} colName */
  function onResizeHandleDown(e, colName) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    startColumnResize(colName)
    const startX = e.clientX
    const move = (/** @type {PointerEvent} */ ev) => applyColumnResize(ev.clientX - startX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      endColumnResize()
      _suppressNextClick = true
      setTimeout(() => { _suppressNextClick = false }, 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** @param {string} colName */
  function onResizeHandleEnter(colName) {
    _resizeHoverCol = colName
    _zoomGuard.block = true
    void import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(1))
      .catch(() => {})
  }

  function onResizeHandleLeave() {
    if (!resizingColName) {
      _resizeHoverCol = null
      _zoomGuard.block = false
    }
  }

  function onCanvasPointerDown(/** @type {PointerEvent} */ e) {
    if (e.button !== 0) return
    const { x, y } = canvasXY(e)
    // Header resize is handled by the DOM overlay — canvas only handles body.
    if (y < HEADER_H) return
    // Record the cell for a potential drag-select; the range only begins once the
    // pointer moves past a small threshold (so plain clicks keep their behavior).
    const t = hitTest(x, y)
    if (t.kind === 'cell') {
      const vi = actualToVisColIdx(/** @type {number} */ (t.actualIdx))
      if (vi >= 0) _rangeDownCell = { row: /** @type {number} */ (t.idx), col: vi, x, y }
    } else {
      _rangeDownCell = null
    }
  }

  function onCanvasPointerUp() {
    if (_rangeDragging) {
      _rangeDragging = false
      _suppressNextClick = true // the drag already set focus/range; don't run the click action
      // Focus the grid so ⌘C (copy range as TSV) and Shift+Arrow are captured.
      tableContainer?.focus({ preventScroll: true })
    }
    _rangeDownCell = null
  }

  function onCanvasPointerMove(/** @type {PointerEvent} */ e) {
    const { x, y } = canvasXY(e)
    if (resizingColName) return

    // Drag-select of a rectangular cell range is DISABLED (no current use). The
    // `false &&` keeps the block for easy re-enable; drag now does nothing here
    // and falls through to the hover logic below.
    if (false && _rangeDownCell && (e.buttons & 1)) {
      if (!_rangeDragging) {
        if (Math.abs(x - _rangeDownCell.x) > 4 || Math.abs(y - _rangeDownCell.y) > 4) {
          _rangeDragging = true
          selAnchor = { row: _rangeDownCell.row, col: _rangeDownCell.col }
          focusedRow = _rangeDownCell.row
          focusedCol = _rangeDownCell.col
          if (selectedCols.size) { selectedCols = new Set(); _lastHeaderClickedCol = null }
        }
      }
      if (_rangeDragging) {
        const t = hitTest(x, y)
        if (t.kind === 'cell') {
          const vi = actualToVisColIdx(/** @type {number} */ (t.actualIdx))
          if (vi >= 0) {
            focusedRow = /** @type {number} */ (t.idx)
            focusedCol = vi
            scrollRowIntoView(/** @type {number} */ (t.idx))
          }
        }
        scheduleDraw()
        return
      }
    }
    if (y < HEADER_H) {
      _resizeHoverCol = null
      _zoomGuard.block = false
      const cx = x + _scrollLeft
      const hit = cx >= gutterWidth ? colAtX(x, geom, _scrollLeft, 0) : null
      hoveredRow = null
      hoveredColName = hit ? hit.col.name : null
      return
    }
    _resizeHoverCol = null
    _zoomGuard.block = false
    // Check virtual expr columns (between real cols and vrel cols)
    if (y >= HEADER_H && _vexprLayout.length > 0) {
      const cx = x + _scrollLeft
      for (const vc of _vexprLayout) {
        if (cx >= vc.x && cx < vc.x + vc.w) {
          const bodyY = y + _scrollTop - HEADER_H - insertRowOffset
          const r = rowAtContentY(rowTops, rows.length, ROW_HEIGHT, bodyY)
          if (r?.inRowBody) { hoveredRow = r.idx; hoveredColName = `__vcol__${vc.id}` }
          return
        }
      }
    }
    // Check virtual rel columns (they are to the right of real + expr columns)
    if (y >= HEADER_H && virtualRelCols.length > 0) {
      const cx = x + _scrollLeft
      const vOffset = cx - geom.totalWidth - vexprTotalW
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
      // Hovering a JSON (object) cell → preload the lightbox/Monaco chunk so the
      // click-to-expand is instant. Gated by the warm flag so it runs at most once.
      if (!_lightboxWarmed) {
        const v = effectiveCellValue(/** @type {number} */ (t.idx), /** @type {number} */ (t.actualIdx))
        if (v !== null && v !== undefined && typeof v === 'object') void prefetchJsonLightbox()
      }
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
    _zoomGuard.block = false
  }

  // Re-sync canvas backing store when devicePixelRatio changes (stray webview
  // page-zoom on macOS). Without this the CSS box and bitmap can drift → blur.
  $effect(() => {
    if (!tableContainer) return
    let lastDpr = window.devicePixelRatio
    const resync = () => {
      invalidateCanvasRect() // window/zoom change moves the canvas — refresh on next hit-test
      const dpr = window.devicePixelRatio
      if (dpr === lastDpr) return
      lastDpr = dpr
      if (syncCanvasSurface()) scheduleDraw()
    }
    window.addEventListener('resize', resync)
    window.visualViewport?.addEventListener('resize', resync)
    return () => {
      window.removeEventListener('resize', resync)
      window.visualViewport?.removeEventListener('resize', resync)
    }
  })

  function onCanvasContextMenu(/** @type {MouseEvent} */ e, /** @type {((e: MouseEvent) => void) | undefined} */ bitsOpen) {
    const { x, y } = canvasXY(e)
    // Check virtual expr column header right-click (not caught by hitTest)
    if (y < HEADER_H && _vexprLayout.length > 0) {
      const cx = x + _scrollLeft
      for (const vc of _vexprLayout) {
        if (cx >= vc.x && cx < vc.x + vc.w) {
          contextIsHeader = true
          contextHeaderCol = `__vcol__${vc.id}`
          bitsOpen?.(e)
          return
        }
      }
    }
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
    const top = HEADER_H + insertRowOffset + (rowTops ? (rowTops[editingCell.rowIdx] ?? 0) : editingCell.rowIdx * ROW_HEIGHT)
    // Pinned columns rest at their frozen x (content-space = scrollLeft + fixed).
    const left = col.pinned
      ? Math.max(col.contentX, _scrollLeft + (geom.pinnedFixedX.get(col.name) ?? 0))
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

<div class="flex min-h-0 flex-1 overflow-hidden">
<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
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
          data-canvas-table=""
          {...props}
          tabindex={-1}
          role="grid"
          aria-label={`${tableName || 'Data'} table, ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
          aria-rowcount={rows.length}
          aria-colcount={navigableColumns.length}
          class={cn(
            "app-scroll relative overflow-auto bg-panel select-none outline-none [scrollbar-gutter:stable] [contain:layout] [overflow-anchor:none]",
            embedded ? "max-h-80" : "min-h-0 flex-1",
            resizingColName && "cursor-col-resize",
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

          <!-- Screen-reader announcement for the focused cell. Visually hidden;
               updated only when focus/edit state changes (not during scroll). -->
          <div
            class="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >{a11yCellAnnouncement}</div>


          <!-- Canvas: always mounted so the 2D context survives table navigation
               (each mount creates a new GPU-tracked context; keeping it alive
               across table switches eliminates the accumulation shown in DevTools). -->
          <div style="position:sticky;top:0;left:0;width:0;height:0;z-index:1;overflow:visible;will-change:transform">
            <canvas
              bind:this={canvasEl}
              class="block"
              style="cursor:default;will-change:transform"
              onclick={guarded(onCanvasClick)}
              ondblclick={guarded(onCanvasDblClick)}
              onauxclick={guarded(onCanvasAuxClick)}
              onpointerdown={guarded(onCanvasPointerDown)}
              onpointermove={guarded(onCanvasPointerMove)}
              onpointerleave={guarded(onCanvasPointerLeave)}
            ></canvas>
          </div>

          {#if visibleColumns.length > 0}
            <!-- Column resize handles: DOM overlay so header edge interaction never
                 hits the canvas (macOS trackpad pinch on canvas was page-zooming
                 the webview and making the grid look huge/blurry).
                 Mirrors the canvas sticky wrapper (sticky top+left 0, width:0,
                 overflow:visible) so handles stay in viewport coordinates even
                 when the table is scrolled horizontally — without left:0 the
                 wrapper drifts with the content and every handle shifts by scrollLeft. -->
            <div
              style="position:sticky;top:0;left:0;width:0;height:0;z-index:2;overflow:visible;pointer-events:none"
              aria-hidden="true"
            >
              {#each resizeHandles as h (h.name)}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize {h.name.startsWith('__vrel__') ? 'relationship column' : `column ${h.name}`}"
                  class="absolute top-0 w-2.5 -translate-x-1/2 cursor-col-resize pointer-events-auto touch-none"
                  style="left:{h.x}px; height:{HEADER_H}px"
                  onpointerdown={(e) => onResizeHandleDown(e, h.name)}
                  onpointerenter={() => onResizeHandleEnter(h.name)}
                  onpointerleave={onResizeHandleLeave}
                  onwheel={blockPointerZoom}
                  onmousewheel={blockPointerZoom}
                  ongesturestart={blockPointerZoom}
                  ongesturechange={blockPointerZoom}
                  ongestureend={blockPointerZoom}
                ></div>
              {/each}
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
                  role="none"
                  class="absolute left-0 z-20 flex border-b border-border/30 bg-panel ring-1 ring-inset ring-emerald-500/25"
                  style="top:{HEADER_H + _scrollTop}px; height:{ROW_HEIGHT}px; width:{insertRowTotalWidth}px"
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
                  {#each columns as col (col.name)}
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
                        <Select.Root
                          type="single"
                          value={newRowDrafts[col.name] ?? ''}
                          onValueChange={(v) => setNewRowDraft(col.name, v ?? '')}
                        >
                          <Select.Trigger
                            data-new-row-input={col.name}
                            disabled={insertSaving}
                            onfocus={() => (newRowFocusCol = col.name)}
                            class="h-7 w-full min-w-0 rounded-md border-0 bg-transparent px-1 py-0 font-mono text-ui-sm text-foreground shadow-none focus-visible:ring-0 disabled:opacity-50"
                          >
                            <span data-slot="select-value" class={cn('truncate', !newRowDrafts[col.name] && 'text-muted-foreground/50')}>
                              {newRowDrafts[col.name] || (col.nullable ? 'NULL / default' : 'Select…')}
                            </span>
                          </Select.Trigger>
                          <Select.Content align="start" sideOffset={4} class="max-h-64 p-1">
                            <Select.Item value="" label={col.nullable ? 'NULL / default' : 'Select…'} class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm text-muted-foreground">{col.nullable ? 'NULL / default' : 'Select…'}</Select.Item>
                            {#each enumValues as opt (opt)}
                              <Select.Item value={opt} label={opt} class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm">{opt}</Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      {:else if isBoolean}
                        <Select.Root
                          type="single"
                          value={newRowDrafts[col.name] ?? ''}
                          onValueChange={(v) => setNewRowDraft(col.name, v ?? '')}
                        >
                          <Select.Trigger
                            data-new-row-input={col.name}
                            disabled={insertSaving}
                            onfocus={() => (newRowFocusCol = col.name)}
                            class="h-7 w-full min-w-0 rounded-md border-0 bg-transparent px-1 py-0 font-mono text-ui-sm text-foreground shadow-none focus-visible:ring-0 disabled:opacity-50"
                          >
                            <span data-slot="select-value" class={cn('truncate', !newRowDrafts[col.name] && 'text-muted-foreground/50')}>
                              {newRowDrafts[col.name] || (col.nullable ? 'NULL / default' : 'Default')}
                            </span>
                          </Select.Trigger>
                          <Select.Content align="start" sideOffset={4} class="min-w-[8rem] p-1">
                            <Select.Item value="" label={col.nullable ? 'NULL / default' : 'Default'} class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm text-muted-foreground">{col.nullable ? 'NULL / default' : 'Default'}</Select.Item>
                            <Select.Item value="true" label="true" class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm">true</Select.Item>
                            <Select.Item value="false" label="false" class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm">false</Select.Item>
                          </Select.Content>
                        </Select.Root>
                      {:else if isDateTime}
                        <DateTimePicker
                          colName={col.name}
                          showTime={true}
                          disabled={insertSaving}
                          value={newRowDrafts[col.name] ?? ''}
                          onchange={(v) => setNewRowDraft(col.name, v)}
                          onfocus={() => (newRowFocusCol = col.name)}
                        />
                      {:else if isDateOnly}
                        <DateTimePicker
                          colName={col.name}
                          showTime={false}
                          disabled={insertSaving}
                          value={newRowDrafts[col.name] ?? ''}
                          onchange={(v) => setNewRowDraft(col.name, v)}
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

              <!-- JSON expand panels (independent from FK sub-view).
                   Same pin pattern as the FK sub-view: outer absolute for vertical
                   position, inner position:sticky;left:0 for the horizontal pin. This
                   lets the compositor hold it at the viewport-left edge during
                   horizontal scroll instead of a reactive transform:translateX() that
                   lags a frame behind the native scroll (the "vibration"). -->
              {#each [...expandedRows] as exIdx (exIdx)}
                {#if rows[exIdx] !== undefined}
                  <div
                    class="absolute z-10 left-0 right-0"
                    style="top:{rowDocTop(exIdx) + ROW_HEIGHT}px"
                  >
                  <div
                    style="position:sticky; left:0; width:{_viewportWidth}px"
                    use:trackExpandHeight={exIdx}
                  >
                    <RowExpandViewer
                      record={rowToRecord(columns, rows[exIdx], hiddenColumns)}
                      rowLabel={"row " + (exIdx + 1)}
                      onclose={() => toggleRowExpand(exIdx)}
                      onopenjson={(value, label) => {
                        void prefetchJsonLightbox()
                        jsonLightbox = { value, colName: label }
                      }}
                    />
                  </div>
                  </div>
                {/if}
              {/each}

              <!-- FK sub-view renders in the docked bottom panel (after the scroll
                   container) — never inline between rows, so grid scrolling stays
                   clean and the canvas hot path is untouched. -->

              <!-- Active inline cell editor -->
              {#if editingCell && editOverlay}
                {@const ecol = columns[editingCell.colIdx]}
                {@const ecached = _colCache[editingCell.colIdx]}
                {@const eEnum = ecached?.enumValues ?? null}
                {@const eType = ecached?.colType ?? ''}
                {@const eNullable = ecol?.nullable ?? true}
                <div
                  in:fade={{ duration: 100, easing: cubicOut }}
                  class="absolute z-30 box-border bg-background ring-2 ring-inset ring-primary"
                  style="top:{editOverlay.top}px; left:{editOverlay.left}px; width:{editOverlay.width}px; height:{editOverlay.height}px"
                >
                  {#if eEnum}
                    <!-- Themed, portaled dropdown (bits-ui) — replaces the native
                         <select>, whose OS popup was unstyled and broke on Linux/
                         WebKitGTK. Auto-opens on edit; picking a value commits. -->
                    <Select.Root
                      type="single"
                      value={editingCell.draft}
                      open={enumEditorOpen}
                      onOpenChange={(o) => {
                        enumEditorOpen = o;
                        // Closed without a pick (Escape / click-away) → cancel edit.
                        if (!o && editingCell) cancelEdit();
                      }}
                      onValueChange={(v) => {
                        if (!editingCell) return;
                        editingCell.draft = v ?? '';
                        void commitEdit();
                      }}
                    >
                      <Select.Trigger
                        bind:ref={editInput}
                        aria-label="Edit {ecol?.name ?? 'cell'}"
                        class="box-border h-full w-full min-w-0 max-w-full rounded-none border-0 bg-transparent px-3 py-0 font-mono text-ui-sm text-foreground shadow-none focus-visible:ring-0"
                      >
                        <span data-slot="select-value" class="truncate">
                          {editingCell.draft || (eNullable ? 'NULL' : 'Select…')}
                        </span>
                      </Select.Trigger>
                      <Select.Content align="start" sideOffset={2} class="max-h-64 min-w-[var(--bits-select-anchor-width)] p-1">
                        {#if eNullable}
                          <Select.Item value="" label="NULL" class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm text-muted-foreground">NULL</Select.Item>
                        {/if}
                        {#if editingCell.original && !eEnum.includes(editingCell.original)}
                          <Select.Item value={editingCell.original} label={editingCell.original} class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm">{editingCell.original}</Select.Item>
                        {/if}
                        {#each eEnum as option (option)}
                          <Select.Item value={option} label={option} class="py-1.5 pl-2.5 pr-8 font-mono text-ui-sm">{option}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
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
                      class="box-border block h-full w-full min-w-0 max-w-full overflow-x-auto border-0 bg-transparent px-3 font-mono text-ui-xs text-foreground outline-none [field-sizing:fixed] selection:bg-primary/20"
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

          <!-- Infinite scroll: sticky bottom loading bar -->
          {#if infiniteScroll && loadingMore}
            <div
              style="position:sticky;bottom:0;left:0;width:100%;pointer-events:none;z-index:5"
              aria-live="polite"
              aria-label="Loading more rows"
            >
              <div class="flex items-center justify-center py-2">
                <div class="flex items-center gap-1.5 rounded-full border border-border/20 bg-background px-3 py-1 elevate-2-rim">
                  <Loader class="size-3 animate-spin text-muted-foreground/50" />
                  <span class="text-[11px] text-muted-foreground/50">Loading more…</span>
                </div>
              </div>
            </div>
          {:else if infiniteScroll && endOfResults && rows.length > 0}
            <!-- Infinite scroll: all rows loaded — explicit end marker so the user
                 knows scrolling won't fetch more (vs. "is it still loading?"). -->
            <div style="position:relative;width:100%;pointer-events:none;z-index:5">
              <div class="flex items-center justify-center py-2.5">
                <span class="rounded-full border border-border/15 bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground/40">
                  End of results — {rows.length.toLocaleString()} {rows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
            </div>
          {/if}

        </div>
      {/snippet}
    </ContextMenu.Trigger>

    <ContextMenu.Content
      onOpenAutoFocus={(e) => e.preventDefault()}
      class={cn(
        "min-w-52 p-0.5 text-ui-xs",
        "[&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs",
        "[&_[data-slot=context-menu-shortcut]]:text-ui-2xs",
        "[&_[data-slot=context-menu-item]_svg]:size-3.5",
      )}
    >
      {#if contextIsHeader && contextHeaderCol.startsWith('__vcol__')}
        {@const vcid = contextHeaderCol.slice(8)}
        {@const vcdef = ($virtualColumnsStore[_tableKey] ?? []).find(c => c.id === vcid)}
        <ContextMenu.Item onSelect={() => runMenuAction(() => { vcolPanelOpen = true })}>
          <Pencil /> Edit column
        </ContextMenu.Item>
        {#if vcdef}
          <ContextMenu.Item onSelect={() => runMenuAction(() => virtualColumnsStore.patch(_tableKey, vcid, { enabled: !vcdef.enabled }))}>
            <EyeOff /> {vcdef.enabled ? 'Disable column' : 'Enable column'}
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item
          onSelect={() => runMenuAction(() => { virtualColumnsStore.remove(_tableKey, vcid) })}
          class="text-destructive focus:text-destructive"
        >
          <Trash2 /> Delete column
        </ContextMenu.Item>
      {:else if contextIsHeader}
        {@const hcol = contextHeaderCol}
        {@const hSortInfo = _sortLookup.get(hcol)}
        {@const hSorted = !!hSortInfo}
        {@const hAsc = hSortInfo?.direction === 'asc'}
        {@const hDesc = hSortInfo?.direction === 'desc'}
        {@const hPinned = pinnedColumns.has(hcol)}
        {@const hVisIdx = visibleColumns.findIndex((c) => c.name === hcol)}
        {@const hIsFirst = hVisIdx <= 0}
        {@const hIsLast = hVisIdx < 0 || hVisIdx >= visibleColumns.length - 1}
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
          <ContextMenu.Item onSelect={() => runMenuAction(() => { if (pendingEdits.size > 0) { toast.error('Unsaved changes', { description: 'Apply or reset your edits before sorting.' }); return } onsortchange([]) })}>
            <ArrowUpDown />
            Clear sort
          </ContextMenu.Item>
        {/if}
        {#if hasTableContext}
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => runMenuAction(() => onfiltercolumn(hcol))}>
            <ListFilter />
            Filter by this column
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => runMenuAction(() => toggleColumnPin(hcol))}>
          {#if hPinned}<PinOff />Unpin column{:else}<Pin />Pin column{/if}
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => runMenuAction(() => onhidecolumn(hcol))}>
          <EyeOff />
          Hide column
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item disabled={hIsFirst} onSelect={() => runMenuAction(() => moveColumn(hcol, 'left'))}>
          <ChevronLeft />
          Move left
        </ContextMenu.Item>
        <ContextMenu.Item disabled={hIsLast} onSelect={() => runMenuAction(() => moveColumn(hcol, 'right'))}>
          <ChevronRight />
          Move right
        </ContextMenu.Item>
        <ContextMenu.Item disabled={hIsFirst} onSelect={() => runMenuAction(() => moveColumn(hcol, 'first'))}>
          <ChevronsLeft />
          Move to first
        </ContextMenu.Item>
        <ContextMenu.Item disabled={hIsLast} onSelect={() => runMenuAction(() => moveColumn(hcol, 'last'))}>
          <ChevronsRight />
          Move to last
        </ContextMenu.Item>
        {#if columnOrder.length > 0}
          <ContextMenu.Item onSelect={() => runMenuAction(() => resetColumnOrder())}>
            <RotateCcw />
            Reset column order
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => runMenuAction(() => resetColumnWidth(hcol))}>
          <RotateCcw />
          Reset column width
        </ContextMenu.Item>
        {#if hasTableContext}
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => runMenuAction(() => { statsCol = statsCol === hcol ? null : hcol })}>
            <BarChart2 />
            Column stats
            {#if statsCol === hcol}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger>
            <Palette />
            Highlight
            {#if colHighlights[hcol]?.color}<span class="ml-auto size-2.5 rounded-full" style="background:{COL_HL_MAP.get(colHighlights[hcol].color)}"></span>{/if}
          </ContextMenu.SubTrigger>
          <ContextMenu.SubContent class="w-40 [&_[data-slot=context-menu-item]]:gap-2 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs">
            {#each COL_HIGHLIGHTS as h (h.id)}
              <ContextMenu.Item onSelect={() => runMenuAction(() => setColHighlight(hcol, h.id))}>
                <span class="size-3.5 shrink-0 rounded-full border border-border/40" style="background:{h.hex}"></span>
                {h.label}
                {#if colHighlights[hcol]?.color === h.id}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
              </ContextMenu.Item>
            {/each}
            {#if colHighlights[hcol]?.color}
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => runMenuAction(() => setColHighlight(hcol, null))}>
                <Ban />
                No color
              </ContextMenu.Item>
            {/if}
          </ContextMenu.SubContent>
        </ContextMenu.Sub>
        <ContextMenu.Item onSelect={() => runMenuAction(() => openTagDialog(hcol))}>
          <Tag />
          {colHighlights[hcol]?.tag ? 'Edit tag…' : 'Tag column…'}
        </ContextMenu.Item>
        {#if colHighlights[hcol]?.tag}
          <ContextMenu.Item onSelect={() => runMenuAction(() => setColTag(hcol, ''))}>
            <Ban />
            Remove tag
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger>
            <Wand2 />
            Transform column
            {#if colTransforms[hcol]}<span class="ml-auto text-[10px] text-primary">on</span>{/if}
          </ContextMenu.SubTrigger>
          <ContextMenu.SubContent class="w-56 [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
            {#if menuColTransforms.length > 0}
              {#each menuColTransforms as t (t.id)}
                <ContextMenu.Item onSelect={() => runMenuAction(() => setColTransform(hcol, t.id))}>
                  <Wand2 />
                  {t.label}
                  {#if colTransforms[hcol] === t.id}<span class="ml-auto text-[10px] text-primary">✓</span>{/if}
                </ContextMenu.Item>
              {/each}
            {:else}
              <div class="px-2 py-1.5 text-[11px] italic text-muted-foreground/50">No transforms apply to this column</div>
            {/if}
            {#if colTransforms[hcol]}
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => runMenuAction(() => setColTransform(hcol, null))}>
                <Ban />
                Clear transform
              </ContextMenu.Item>
            {/if}
          </ContextMenu.SubContent>
        </ContextMenu.Sub>
      {:else}
        <ContextMenu.Item onSelect={() => runMenuAction(() => openInInspector(contextRowIdx))}>
          <PanelRight />
          Open
        </ContextMenu.Item>
        {#if menuForeignKey}
          <ContextMenu.Item
            disabled={menuCellNull}
            title={menuCellNull ? 'This value is NULL — there is no referenced row to open.' : undefined}
            onSelect={() =>
              runMenuAction(() =>
                onfollowforeignkey({
                  rowIdx: contextRowIdx,
                  colIdx: contextColIdx,
                }),
              )}
          >
            <ExternalLink />
            {menuCellNull ? 'Open Tab — value is NULL' : 'Open Tab'}
            {#if !menuCellNull}<ContextMenu.Shortcut>⌘↵</ContextMenu.Shortcut>{/if}
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => runMenuAction(() => toggleColumnPin(menuColName))}>
          {#if menuColPinned}<PinOff />Unpin column{:else}<Pin />Pin column{/if}
        </ContextMenu.Item>
        <ContextMenu.Separator />
        {#if hasTableContext}
          <ContextMenu.Item
            disabled={!menuEditable || readonly}
            onSelect={() => runMenuAction(() => startEdit(contextRowIdx, contextColIdx))}
          >
            <Pencil />
            Edit
            <ContextMenu.Shortcut>Enter</ContextMenu.Shortcut>
          </ContextMenu.Item>
        {/if}
        {#if menuCellIsArray && menuEditable && !readonly}
          <ContextMenu.Item onSelect={() => runMenuAction(() => openArrayEditor(contextRowIdx, contextColIdx))}>
            <Braces />
            Edit array…
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Item onSelect={() => runMenuAction(() => copyCellValue(contextRowIdx, contextColIdx))}>
          <Copy />
          Copy
          <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
        </ContextMenu.Item>
        {#if hasTableContext}
          <ContextMenu.Item
            disabled={menuCellOversize}
            onSelect={() => runMenuAction(() => onfilterbyvalue(menuColName, rows[contextRowIdx]?.[contextColIdx]))}
          >
            <ListFilter />
            {menuCellNull ? 'Filter: is NULL' : 'Filter by value'}
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={menuCellOversize}
            onSelect={() => runMenuAction(() => onfilterbyvalue(menuColName, rows[contextRowIdx]?.[contextColIdx], true))}
          >
            <FilterX />
            {menuCellNull ? 'Exclude: not NULL' : 'Exclude this value'}
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={!menuEditable || menuCellNull || readonly}
            onSelect={() => runMenuAction(() => setCellNull(contextRowIdx, contextColIdx))}
          >
            <CircleSlash />
            Set NULL
          </ContextMenu.Item>
        {/if}
        {#if showRowExpand}
          <ContextMenu.Item onSelect={() => runMenuAction(() => toggleRowExpand(contextRowIdx))}>
            <Braces />
            {isRowExpanded(contextRowIdx) ? "Collapse row JSON" : "Expand"}
          </ContextMenu.Item>
        {/if}
        {#if menuTransforms.length > 0}
          <ContextMenu.Separator />
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger>
              <Wand2 />
              Transform
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent class="w-48 [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
              {#each menuTransforms as t (t.id)}
                <ContextMenu.Item onSelect={() => runMenuAction(() => runCellTransform(contextRowIdx, contextColIdx, t))}>
                  <Wand2 />
                  {t.label}
                </ContextMenu.Item>
              {/each}
            </ContextMenu.SubContent>
          </ContextMenu.Sub>
        {/if}
        {#if menuGenerators.length > 0 && menuEditable && !readonly && hasTableContext}
          {#if menuTransforms.length === 0}<ContextMenu.Separator />{/if}
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger>
              <Sparkles />
              Insert generated value
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent class="w-48 [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
              {#each menuGenerators as g (g.id)}
                <ContextMenu.Item onSelect={() => runMenuAction(() => insertGeneratedValue(contextRowIdx, contextColIdx, g))}>
                  <Sparkles />
                  {g.label}
                </ContextMenu.Item>
              {/each}
            </ContextMenu.SubContent>
          </ContextMenu.Sub>
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
            {#if hasTableContext}
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => runMenuAction(() => copyAs(contextRowIdx, 'insert'))}>
                <Copy />
                INSERT statement
              </ContextMenu.Item>
            {/if}
          </ContextMenu.SubContent>
        </ContextMenu.Sub>
        <ContextMenu.Item onSelect={() => runMenuAction(() => toggleRow(contextRowIdx))}>
          <CheckSquare />
          {selected.has(contextRowIdx) ? "Deselect row" : "Select row"}
        </ContextMenu.Item>
        {#if hasTableContext}
        <ContextMenu.Item
          disabled={readonly}
          onSelect={() => runMenuAction(() => duplicateRow(contextRowIdx))}
        >
          <CopyPlus />
          Duplicate row
        </ContextMenu.Item>
        <ContextMenu.Separator />
        {#if pendingDeletes.has(contextRowIdx)}
          <ContextMenu.Item
            disabled={readonly}
            class="whitespace-nowrap"
            onSelect={() => runMenuAction(() => undoDeleteRow(contextRowIdx))}
          >
            <RotateCcw />
            Undo delete
          </ContextMenu.Item>
        {:else}
          <ContextMenu.Item
            variant="destructive"
            disabled={!hasPrimaryKey || saving || readonly}
            class="whitespace-nowrap"
            onSelect={() => runMenuAction(() => deleteRow(contextRowIdx))}
          >
            <Trash2 />
            {selected.size > 1 && selected.has(contextRowIdx)
              ? `Delete ${formatCompactCount(selected.size)} rows`
              : "Delete row"}
            <ContextMenu.Shortcut>⌘⌫</ContextMenu.Shortcut>
          </ContextMenu.Item>
        {/if}
        {/if}
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Root>
{/if}

<!-- Related-rows dock — sits BELOW the scroll container in this flex column, so
     it never scrolls with the grid and the grid never fights its inner scroll. -->
{#if fkSubview !== null && rows[fkSubview.rowIdx] !== undefined}
  {@const fkIdx = fkSubview.rowIdx}
  <div
    class="relative z-10 flex shrink-0 flex-col border-t border-border/60 bg-background"
    style="height:{fkDockHeight}px"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize related rows panel"
      class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
      onpointerdown={startFkDockResize}
    ></div>
    <FkSubviewPanel
      data={fkSubview.data}
      fkLabel={fkSubview.label}
      sourceHint={`row ${fkIdx + 1}`}
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
</div>

{#if statsCol && hasTableContext}
  {@const statsColInfo = columns.find(c => c.name === statsCol)}
  <ColumnStatsPanel
    {schema}
    table={tableName}
    column={statsCol}
    dataType={statsColInfo?.dataType ?? statsColInfo?.data_type ?? ""}
    onclose={() => { statsCol = null }}
  />
{/if}
{#if vcolPanelOpen}
  <VirtualColumnsPanel
    {schema}
    tableName={tableName}
    {columns}
    {rows}
    nameToIdx={_nameToActualIdx}
    onclose={() => { vcolPanelOpen = false }}
  />
{/if}
</div>

<Dialog.Root bind:open={tagDialogOpen}>
  <Dialog.Content class="max-w-sm gap-4">
    <Dialog.Header>
      <Dialog.Title class="text-sm font-semibold">Tag column</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        A short label shown on the “{tagDialogCol}” header. Leave empty to remove.
      </Dialog.Description>
    </Dialog.Header>
    <input
      bind:value={tagDialogValue}
      maxlength="24"
      spellcheck="false"
      placeholder="e.g. PII, money, deprecated"
      class="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-ui-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-1 focus:ring-ring"
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmTag(); } else if (e.key === 'Escape') { e.preventDefault(); tagDialogOpen = false; } }}
    />
    <Dialog.Footer class="gap-2 sm:justify-end">
      <button type="button" class="inline-flex h-8 items-center rounded-lg border border-border/60 px-3 text-ui-xs font-medium text-foreground transition-colors hover:bg-muted" onclick={() => (tagDialogOpen = false)}>Cancel</button>
      <button type="button" class="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-ui-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90" onclick={confirmTag}>Save</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<MediaLightbox
  url={lightboxUrl}
  type={lightboxType}
  onclose={() => {
    lightboxUrl = null;
  }}
/>

<!-- Lazy: only loads Monaco the first time a JSON cell is expanded, keeping the
     editor out of the startup bundle/memory for plain table browsing. -->
{#if jsonLightbox}
  {#await import('./JsonCellLightbox.svelte') then { default: JsonCellLightbox }}
    <JsonCellLightbox
      data={jsonLightbox}
      onclose={() => { jsonLightbox = null }}
    />
  {/await}
{/if}

<ArrayCellEditor
  bind:open={arrayEditorOpen}
  column={arrayEditorColName}
  elementType={arrayEditorType}
  value={arrayEditorValue}
  onsave={commitArrayEditor}
/>

<CellQuickLook
  bind:cell={quickLookCell}
  {saving}
  oncancel={cancelQuickLook}
  onsave={commitQuickLook}
/>

<!-- DML preview / confirm — shown before any edit, insert, or delete is applied. -->
<Dialog.Root
  open={dmlPreview !== null}
  onOpenChange={(o) => { if (!o && !dmlPreviewRunning) dmlPreview = null }}
>
  <Dialog.Content class="max-w-2xl gap-3">
    {#if dmlPreview}
      <Dialog.Header class="gap-1">
        <Dialog.Title class="text-ui-sm">{dmlPreview.title}</Dialog.Title>
        <Dialog.Description class="text-ui-xs text-muted-foreground/70">
          {dmlPreview.description}
        </Dialog.Description>
      </Dialog.Header>

      <div class="flex items-center justify-between gap-2">
        <span class="text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/50">
          SQL to run{dmlPreview.statements.length > 1 ? ` · ${dmlPreview.statements.length} statements` : ''}
        </span>
        {#if dmlWasEdited}
          <button
            type="button"
            onclick={() => { dmlEditedSql = dmlOriginalSql }}
            disabled={dmlPreviewRunning}
            class="inline-flex items-center gap-1 text-ui-2xs text-muted-foreground/60 transition-transform duration-100 ease-out hover:text-foreground active:scale-[0.97] disabled:opacity-50"
            title="Discard your edits and restore the generated SQL"
          >
            <RotateCcw class="size-3" />
            Reset SQL
          </button>
        {/if}
      </div>

      <!-- Editable, prettified SQL. Monaco loads lazily (kept out of the plain
           table-browsing bundle); Shiki renders an instant highlighted preview
           while it mounts. Editing the SQL switches Apply to run it verbatim. -->
      <div class="flex h-[min(46vh,380px)] min-h-[160px] flex-col overflow-hidden rounded-lg border border-border/50 bg-background/40">
        {#await import('./SqlEditor.svelte')}
          <ShikiBlock code={dmlEditedSql} lang="sql" />
        {:then { default: SqlEditor }}
          <SqlEditor bind:value={dmlEditedSql} onmodenter={confirmDmlPreview} class="rounded-lg" />
        {/await}
      </div>

      {#if dmlWasEdited}
        <p class="text-ui-2xs text-amber-500/80">
          You edited the SQL — Apply will run it exactly as written.
        </p>
      {/if}

      <Dialog.Footer class="gap-2 sm:justify-end">
        <button
          type="button"
          onclick={() => { if (!dmlPreviewRunning) dmlPreview = null }}
          disabled={dmlPreviewRunning}
          class="inline-flex h-8 items-center rounded-md px-3 text-ui-xs text-muted-foreground transition-transform duration-100 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={confirmDmlPreview}
          disabled={dmlPreviewRunning}
          class={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-ui-xs font-medium transition-transform duration-100 ease-out active:scale-[0.97] disabled:opacity-60",
            dmlPreview.destructive
              ? "bg-destructive text-destructive-foreground hover:opacity-90"
              : "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          {#if dmlPreviewRunning}
            <Loader class="size-3 animate-spin" />
          {:else if dmlPreview.destructive}
            <Trash2 class="size-3" />
          {:else}
            <Check class="size-3" />
          {/if}
          {dmlPreview.confirmLabel}
        </button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

