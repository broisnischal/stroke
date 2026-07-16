<script>
  import { untrack } from 'svelte'
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import {
    normalizeCellValue,
    formatJsonValue,
    formatNormalValue,
  } from '$lib/row-inspector.js'
  import {
    isEditableType,
    isBooleanType,
    getColumnEnumValues,
    valueToEditString,
    parseCellInput,
    normalizeColumnType,
    oversizeCellInfo,
  } from '$lib/cell-value.js'

  /**
   * Record mode for the data table — shows one row at a time as a vertical
   * field list (DBeaver-style "record view") with prev/next navigation and
   * the same inline field editing as the row inspector panel.
   */
  let {
    /** @type {Array<{ name: string, dataType?: string, data_type?: string, nullable?: boolean }>} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
    /** @type {string[]} */
    primaryKey = [],
    /** @type {Set<string>} */
    hiddenColumns = new Set(),
    /** Absolute offset of the first loaded row (for the "Record N of M" label). */
    offset = 0,
    /** Total rows in the result (-1 while the count is still being fetched). */
    total = 0,
    initialIndex = 0,
    /** @type {(index: number) => void} */
    onindexchange = () => {},
    hasPrevPage = false,
    hasNextPage = false,
    onprevpage = () => {},
    onnextpage = () => {},
    /** @type {((detail: { rowIdx: number, colIdx: number, value: unknown }) => Promise<void>) | null} */
    onsave = null,
    readonly = false,
  } = $props()

  // svelte-ignore state_referenced_locally — the initial index deliberately
  // captures the mount-time rows; later row changes are handled by the effect below.
  let idx = $state(Math.min(Math.max(initialIndex ?? 0, 0), Math.max(rows.length - 1, 0)))
  let fieldSearch = $state('')
  // When navigating to the previous page, land on its last record once rows arrive.
  let landAtEnd = false

  /** @param {number} i */
  function setIdx(i) {
    idx = i
    onindexchange(i)
  }

  // Keep idx valid when the loaded page changes (pagination, refresh, filters).
  $effect(() => {
    void rows
    untrack(() => {
      if (landAtEnd) {
        landAtEnd = false
        setIdx(Math.max(0, rows.length - 1))
      } else if (idx > rows.length - 1) {
        setIdx(Math.max(0, rows.length - 1))
      }
    })
  })

  const canPrev = $derived(idx > 0 || hasPrevPage)
  const canNext = $derived(idx < rows.length - 1 || hasNextPage)

  function goPrev() {
    if (idx > 0) setIdx(idx - 1)
    else if (hasPrevPage) {
      landAtEnd = true
      onprevpage()
    }
  }

  function goNext() {
    if (idx < rows.length - 1) setIdx(idx + 1)
    else if (hasNextPage) {
      onnextpage()
      setIdx(0)
    }
  }

  const recordLabel = $derived.by(() => {
    if (rows.length === 0) return 'No records'
    const n = (offset + idx + 1).toLocaleString('en-US')
    const of = total < 0 ? '…' : total.toLocaleString('en-US')
    return `${n} of ${of}`
  })

  // ── Fields ────────────────────────────────────────────────────────────────
  const pkSet = $derived(new Set(primaryKey))

  const fields = $derived.by(() => {
    if (columns.length === 0 || rows.length === 0) return []
    const row = rows[idx] ?? []
    const canEdit = !!onsave && primaryKey.length > 0 && !readonly
    /** @type {Array<Record<string, any>>} */
    const out = []
    columns.forEach((col, i) => {
      if (hiddenColumns.has(col.name)) return
      const raw = normalizeCellValue(row[i])
      const dataType = col.dataType ?? col.data_type ?? ''
      const normalType = normalizeColumnType(dataType)
      const enumValues = getColumnEnumValues(col)
      const isPk = pkSet.has(col.name)
      // Same rules as the row inspector: PKs, non-editable types and truncated
      // oversize cells stay read-only.
      const editable = canEdit && !isPk && isEditableType(dataType) && !oversizeCellInfo(raw)
      const isNull = raw === null
      const isEmpty = typeof raw === 'string' && raw === ''
      out.push({
        colIdx: i,
        name: col.name,
        dataType,
        raw,
        isNull,
        isEmpty,
        displayValue: isNull ? 'NULL' : isEmpty ? 'EMPTY' : formatNormalValue(raw),
        initialEditStr: valueToEditString(raw),
        editable,
        isPk,
        isBoolean: isBooleanType(dataType),
        enumValues,
        isMultiline: typeof raw === 'object' && raw !== null,
        isJsonType: normalType.startsWith('json'),
        nullable: col.nullable !== false,
      })
    })
    return out
  })

  const filteredFields = $derived(
    fieldSearch
      ? fields.filter(
          (f) =>
            f.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
            f.displayValue.toLowerCase().includes(fieldSearch.toLowerCase()),
        )
      : fields,
  )

  // ── Field editing (mirrors RowDetailPanel) ────────────────────────────────
  /** @type {Record<number, boolean>} */
  let savingFields = $state({})
  /** @type {Record<number, string | undefined>} */
  let fieldErrors = $state({})
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const debounceTimers = new Map()

  // Cancel pending debounced saves when the shown record changes.
  $effect(() => {
    void idx
    return () => {
      for (const t of debounceTimers.values()) clearTimeout(t)
      debounceTimers.clear()
      fieldErrors = {}
    }
  })

  /**
   * Stable string representation used for change-detection.
   * @param {unknown} v
   */
  function stableStr(v) {
    if (v === null || v === undefined) return '\x00NULL'
    if (typeof v === 'object') {
      try { return JSON.stringify(v) } catch { return String(v) }
    }
    return String(v)
  }

  /**
   * @param {number} colIdx
   * @param {string} rawStr
   * @param {boolean} [force]
   */
  async function saveField(colIdx, rawStr, force = false) {
    if (!onsave) return
    const col = columns[colIdx]
    if (!col) return
    const dataType = col.dataType ?? col.data_type ?? ''
    const enumValues = getColumnEnumValues(col)
    const result = parseCellInput(rawStr, dataType, enumValues)
    if (!result.ok) {
      fieldErrors = { ...fieldErrors, [colIdx]: result.message }
      return
    }
    fieldErrors = { ...fieldErrors, [colIdx]: undefined }
    if (!force) {
      const original = fields.find((f) => f.colIdx === colIdx)?.raw ?? null
      if (stableStr(result.value) === stableStr(original)) return
    }
    await commitValue(colIdx, result.value)
  }

  /**
   * @param {number} colIdx
   * @param {unknown} value
   */
  async function commitValue(colIdx, value) {
    if (!onsave) return
    const col = columns[colIdx]
    if (!col) return
    const t = debounceTimers.get(colIdx)
    if (t) { clearTimeout(t); debounceTimers.delete(colIdx) }
    savingFields = { ...savingFields, [colIdx]: true }
    try {
      await onsave({ rowIdx: idx, colIdx, value })
    } catch (e) {
      toast.error(`Failed to save ${col.name}`, { description: String(e) })
    } finally {
      savingFields = { ...savingFields, [colIdx]: false }
    }
  }

  /**
   * @param {number} colIdx
   * @param {string} rawStr
   */
  function scheduleFieldSave(colIdx, rawStr) {
    const existing = debounceTimers.get(colIdx)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      debounceTimers.delete(colIdx)
      void saveField(colIdx, rawStr)
    }, 600)
    debounceTimers.set(colIdx, t)
  }

  /**
   * @param {number} colIdx
   * @param {KeyboardEvent} e
   */
  function handleFieldKeydown(colIdx, e) {
    const el = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.currentTarget)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const existing = debounceTimers.get(colIdx)
      if (existing) { clearTimeout(existing); debounceTimers.delete(colIdx) }
      void saveField(colIdx, el.value)
      el.blur()
    }
    if (e.key === 'Escape') {
      const existing = debounceTimers.get(colIdx)
      if (existing) { clearTimeout(existing); debounceTimers.delete(colIdx) }
      el.blur()
    }
  }

  /**
   * @param {number} colIdx
   * @param {FocusEvent} e
   */
  function handleFieldBlur(colIdx, e) {
    const existing = debounceTimers.get(colIdx)
    if (existing) { clearTimeout(existing); debounceTimers.delete(colIdx) }
    const el = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.currentTarget)
    void saveField(colIdx, el.value)
  }

  /** @param {{ raw: unknown, name: string }} field */
  async function copyFieldValue(field) {
    const text = field.raw === null ? 'NULL' : typeof field.raw === 'object' ? formatJsonValue(field.raw) : String(field.raw)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${field.name}`)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  async function copyRecordJson() {
    /** @type {Record<string, unknown>} */
    const record = {}
    for (const f of fields) record[f.name] = f.raw
    try {
      await navigator.clipboard.writeText(formatJsonValue(record))
      toast.success('Copied record JSON')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    const target = /** @type {HTMLElement} */ (e.target)
    if (target.closest('input, textarea, select')) return
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault()
      goNext()
    }
  }

  const navBtn =
    'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
  role="group"
  aria-label="Record view"
  tabindex={0}
  onkeydown={handleKeydown}
>
  <!-- Navigation bar -->
  <div class="studio-chrome flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-panel px-2">
    <button type="button" class={navBtn} title="First record on page" disabled={idx === 0 || rows.length === 0} onclick={() => setIdx(0)}>
      <Icon name="chevrons-left" class="size-3.5" />
    </button>
    <button type="button" class={navBtn} title="Previous record (←)" disabled={!canPrev} onclick={goPrev}>
      <Icon name="chevron-left" class="size-3.5" />
    </button>
    <span class="min-w-24 select-none px-1 text-center font-mono text-ui-2xs tabular-nums text-muted-foreground">
      {recordLabel}
    </span>
    <button type="button" class={navBtn} title="Next record (→)" disabled={!canNext} onclick={goNext}>
      <Icon name="chevron-right" class="size-3.5" />
    </button>
    <button
      type="button"
      class={navBtn}
      title="Last record on page"
      disabled={rows.length === 0 || idx === rows.length - 1}
      onclick={() => setIdx(rows.length - 1)}
    >
      <Icon name="chevrons-right" class="size-3.5" />
    </button>

    <div class="ml-auto flex min-w-0 shrink-0 items-center gap-0.5">
      <div class="relative flex h-6 w-40 items-center">
        <Icon name="search" class="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search fields…"
          bind:value={fieldSearch}
          class="h-6 w-full min-w-0 rounded-md border border-transparent bg-accent/40 pl-6.5 pr-2 font-mono text-ui-2xs placeholder:text-muted-foreground/50 focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div class="mx-1 h-4 w-px bg-border/60"></div>
      <button
        type="button"
        title="Copy record as JSON"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        disabled={rows.length === 0}
        onclick={copyRecordJson}
      >
        <Icon name="copy" class="size-3 shrink-0" />
        <span>Copy</span>
      </button>
    </div>
  </div>

  <!-- Field list -->
  <div class="app-scroll min-h-0 flex-1 overflow-y-auto bg-panel">
    {#if rows.length === 0}
      <div class="flex h-full items-center justify-center">
        <p class="font-mono text-ui-sm text-muted-foreground/40">No rows on this page</p>
      </div>
    {:else}
      <div class="mx-auto w-full max-w-3xl px-4 py-3">
        {#key idx}
          {#each filteredFields as field (field.colIdx)}
            <div
              class={cn(
                'group/field grid grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-border/30 py-1.5',
                fields.length > 100 && '[content-visibility:auto] [contain-intrinsic-size:auto_40px]',
              )}
            >
              <!-- Label -->
              <div class="flex min-w-0 flex-col pt-1.5">
                <span class="flex items-center gap-1 truncate font-mono text-ui-xs text-foreground/85">
                  <span class="truncate">{field.name}</span>
                  {#if field.isPk}
                    <span title="Primary key — cannot be changed" class="inline-flex shrink-0 items-center gap-0.5 font-mono text-ui-3xs text-amber-500/70">
                      <Icon name="key-round" class="size-2.5" />
                    </span>
                  {/if}
                </span>
                <span class="truncate font-mono text-ui-3xs text-muted-foreground/50">{field.dataType}</span>
              </div>

              <!-- Value -->
              <div class="relative min-w-0">
                {#if !field.editable}
                  <div
                    class={cn(
                      'w-full rounded border border-border/40 bg-muted/10 px-2.5 py-1.5 font-mono text-ui-xs',
                      field.isNull || field.isEmpty ? 'italic text-muted-foreground/40' : 'text-foreground',
                      field.isMultiline ? 'whitespace-pre-wrap break-all' : 'truncate',
                    )}
                    title={field.displayValue}
                  >{field.displayValue}</div>
                {:else if field.isBoolean || field.enumValues}
                  <select
                    value={field.initialEditStr}
                    disabled={savingFields[field.colIdx]}
                    class="w-full appearance-none rounded border border-border bg-muted/20 px-2.5 py-1.5 pr-7 font-mono text-ui-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    onchange={(e) => void saveField(field.colIdx, /** @type {HTMLSelectElement} */ (e.target).value)}
                  >
                    {#if field.nullable}
                      <option value="">NULL</option>
                    {/if}
                    {#if field.isBoolean}
                      <option value="true">true</option>
                      <option value="false">false</option>
                    {:else}
                      {#each field.enumValues as opt (opt)}
                        <option value={opt}>{opt}</option>
                      {/each}
                    {/if}
                  </select>
                  <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50">
                    <Icon name="chevron-down" class="size-3" />
                  </span>
                {:else if field.isMultiline}
                  <textarea
                    value={field.initialEditStr}
                    rows={Math.min(8, Math.max(2, (field.initialEditStr.match(/\n/g)?.length ?? 0) + 1))}
                    disabled={savingFields[field.colIdx]}
                    placeholder={field.isNull ? 'NULL' : ''}
                    class={cn(
                      'w-full resize-none rounded border bg-muted/20 px-2.5 py-1.5 font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50',
                      fieldErrors[field.colIdx] ? 'border-destructive' : 'border-border',
                    )}
                    oninput={(e) => scheduleFieldSave(field.colIdx, /** @type {HTMLTextAreaElement} */ (e.currentTarget).value)}
                    onblur={(e) => handleFieldBlur(field.colIdx, e)}
                    onkeydown={(e) => handleFieldKeydown(field.colIdx, e)}
                  ></textarea>
                {:else}
                  <input
                    type="text"
                    value={field.initialEditStr}
                    disabled={savingFields[field.colIdx]}
                    placeholder={field.isNull ? 'NULL' : ''}
                    class={cn(
                      'w-full rounded border bg-muted/20 px-2.5 py-1.5 font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50',
                      fieldErrors[field.colIdx] ? 'border-destructive' : 'border-border',
                    )}
                    oninput={(e) => scheduleFieldSave(field.colIdx, /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                    onblur={(e) => handleFieldBlur(field.colIdx, e)}
                    onkeydown={(e) => handleFieldKeydown(field.colIdx, e)}
                  />
                {/if}

                {#if savingFields[field.colIdx]}
                  <Icon name="loader-2" class="absolute -left-5 top-2.5 size-3 animate-spin text-muted-foreground" />
                {/if}
                {#if fieldErrors[field.colIdx]}
                  <p class="mt-0.5 font-mono text-ui-3xs text-destructive">{fieldErrors[field.colIdx]}</p>
                {/if}
              </div>

              <!-- Hover actions -->
              <div class="flex items-center gap-0.5 pt-1">
                <button
                  type="button"
                  class="invisible inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground group-hover/field:visible"
                  title="Copy value"
                  onclick={() => void copyFieldValue(field)}
                >
                  <Icon name="copy" class="size-3" />
                </button>
                {#if field.editable && field.nullable}
                  <button
                    type="button"
                    class="invisible inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground group-hover/field:visible"
                    title="Set NULL"
                    disabled={field.isNull || savingFields[field.colIdx]}
                    onclick={() => void commitValue(field.colIdx, null)}
                  >
                    <Icon name="eraser" class="size-3" />
                  </button>
                {/if}
              </div>
            </div>
          {/each}

          {#if filteredFields.length === 0 && fieldSearch}
            <p class="py-6 text-center font-mono text-ui-xs text-muted-foreground/60">No fields match</p>
          {/if}
        {/key}
      </div>
    {/if}
  </div>
</div>
