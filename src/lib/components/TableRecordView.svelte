<script>
  import FieldSelect from './FieldSelect.svelte';
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
   * Record mode for the data table - shows one row at a time as a vertical
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

  // svelte-ignore state_referenced_locally - the initial index deliberately
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

  /**
   * Which field is currently being edited, by column index.
   *
   * Every editable field used to render a live <input>/<textarea>/<select> the
   * whole time. On a 136-column table that is 136 form controls with three
   * listeners each, sitting in the DOM whether or not anybody is typing - and
   * the whole set was wrapped in `{#key idx}`, so stepping to the next record
   * destroyed and rebuilt all of them. That teardown is what the arrow keys felt
   * like. A field is plain text until you click it.
   * @type {number | null}
   */
  let editingIdx = $state(null)
  /** @param {HTMLElement} node */
  function focusOnMount(node) {
    const el = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (
      node.matches('input, textarea') ? node : node.querySelector('input, textarea')
    )
    el?.focus()
    if (el && 'select' in el) el.select()
  }
  // Leaving a record closes the editor with it; the draft is already committed
  // by the blur handler, so there is nothing to carry across.
  $effect(() => { void idx; editingIdx = null })

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
        // Precomputed: this used to run a /\n/g match per field on every
        // render, allocating an array each time just to count lines.
        textRows: Math.min(8, Math.max(2, (valueToEditString(raw).match(/\n/g)?.length ?? 0) + 1)),
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
    <span class="min-w-28 select-none rounded-full bg-accent/40 px-2.5 py-0.5 text-center font-mono text-ui-2xs tabular-nums text-foreground/80">
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
          class="h-6 w-full min-w-0 rounded-md border border-transparent bg-accent/40 pl-6.5 pr-2 font-mono text-ui-2xs placeholder:text-muted-foreground focus:border-ring/55 focus:ring-2 focus:ring-ring/15 focus:outline-none"
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
        <p class="font-mono text-ui-sm text-muted-foreground">No rows on this page</p>
      </div>
    {:else}
      <div class="mx-auto w-full max-w-3xl px-6 py-5">
        <!-- A label/value list, not a form. Every value used to sit in its own
             bordered box whether or not it was editable, which made twelve rows
             read as twelve inputs and gave the panel a ragged right edge: the
             actions column is `auto`, and an editable field has two buttons
             where a read-only one has one, so every row ended at a different x.
             Values are text now, the control appears when you click one, and the
             actions column is a fixed width so the value column is too. -->
        <dl class="divide-y divide-border/30 overflow-hidden rounded-lg border border-border/50 bg-card/40">
          {#each filteredFields as field (field.colIdx)}
            {@const editing = editingIdx === field.colIdx}
            <div class="group/field grid grid-cols-[minmax(8.5rem,12rem)_minmax(0,1fr)_3.25rem] items-start gap-x-4 px-4 py-2 transition-colors [contain-intrinsic-size:auto_44px] [content-visibility:auto] hover:bg-accent/20">
              <dt class="flex min-w-0 flex-col pt-1.5">
                <span class="flex items-center gap-1 truncate font-mono text-ui-xs text-foreground">
                  <span class="truncate">{field.name}</span>
                  {#if field.isPk}
                    <Icon name="key-round" class="size-3 shrink-0 text-warning" title="Primary key, cannot be changed" />
                  {/if}
                </span>
                <span class="truncate font-mono text-ui-3xs text-muted-foreground" title={field.dataType}>{field.dataType}</span>
              </dt>

              <dd class="relative min-w-0">
                {#if field.editable && editing}
                  {#if field.isBoolean || field.enumValues}
                    <div use:focusOnMount>
                      <FieldSelect
                        class="w-full bg-transparent text-ui-xs"
                        value={field.initialEditStr}
                        disabled={savingFields[field.colIdx]}
                        onchange={(v) => { void saveField(field.colIdx, v); editingIdx = null }}
                        options={[
                          ...(field.nullable ? [{ value: '', label: 'NULL' }] : []),
                          ...(field.isBoolean
                            ? [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]
                            : field.enumValues.map((/** @type {string} */ opt) => ({ value: opt, label: opt }))),
                        ]}
                      />
                    </div>
                  {:else if field.isMultiline}
                    <textarea
                      use:focusOnMount
                      value={field.initialEditStr}
                      rows={field.textRows}
                      disabled={savingFields[field.colIdx]}
                      placeholder={field.isNull ? 'NULL' : ''}
                      class={cn(
                        'field-surface w-full resize-none bg-transparent px-2.5 py-1.5 font-mono text-ui-xs text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50',
                        fieldErrors[field.colIdx] && 'border-destructive',
                      )}
                      oninput={(e) => scheduleFieldSave(field.colIdx, /** @type {HTMLTextAreaElement} */ (e.currentTarget).value)}
                      onblur={(e) => { handleFieldBlur(field.colIdx, e); editingIdx = null }}
                      onkeydown={(e) => handleFieldKeydown(field.colIdx, e)}
                    ></textarea>
                  {:else}
                    <input
                      use:focusOnMount
                      type="text"
                      value={field.initialEditStr}
                      disabled={savingFields[field.colIdx]}
                      placeholder={field.isNull ? 'NULL' : ''}
                      class={cn(
                        'field-surface w-full bg-transparent px-2.5 py-1.5 font-mono text-ui-xs text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50',
                        fieldErrors[field.colIdx] && 'border-destructive',
                      )}
                      oninput={(e) => scheduleFieldSave(field.colIdx, /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                      onblur={(e) => { handleFieldBlur(field.colIdx, e); editingIdx = null }}
                      onkeydown={(e) => handleFieldKeydown(field.colIdx, e)}
                    />
                  {/if}
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    role={field.editable ? 'button' : undefined}
                    tabindex={field.editable ? 0 : undefined}
                    aria-label={field.editable ? `Edit ${field.name}` : undefined}
                    class={cn(
                      'w-full rounded-md border border-transparent px-2.5 py-1.5 font-mono text-ui-xs',
                      field.editable && 'cursor-text hover:border-field-border',
                      field.isNull || field.isEmpty ? 'italic text-muted-foreground' : 'text-foreground',
                      field.isMultiline ? 'line-clamp-3 break-all whitespace-pre-wrap' : 'truncate',
                    )}
                    title={field.displayValue}
                    onclick={() => { if (field.editable) editingIdx = field.colIdx }}
                    onkeydown={(e) => {
                      if (!field.editable) return
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      editingIdx = field.colIdx
                    }}
                  >{field.displayValue}</div>
                {/if}

                {#if savingFields[field.colIdx]}
                  <Icon name="loader-2" class="absolute -left-5 top-2.5 size-3 animate-spin text-muted-foreground" />
                {/if}
                {#if fieldErrors[field.colIdx]}
                  <p class="mt-0.5 font-mono text-ui-3xs text-destructive">{fieldErrors[field.colIdx]}</p>
                {/if}
              </dd>

              <!-- Fixed width, so a row with a Set-NULL button and one without
                   still end their value column at the same x. -->
              <div class="flex items-center justify-end gap-0.5 pt-1">
                <button
                  type="button"
                  class="opacity-0 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground group-hover/field:opacity-100"
                  title="Copy value"
                  aria-label="Copy {field.name}"
                  onclick={() => void copyFieldValue(field)}
                >
                  <Icon name="copy" class="size-3" />
                </button>
                {#if field.editable && field.nullable}
                  <button
                    type="button"
                    class="opacity-0 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground group-hover/field:opacity-100"
                    title="Set NULL"
                    aria-label="Set {field.name} to NULL"
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
            <p class="px-4 py-8 text-center font-mono text-ui-xs text-muted-foreground">No fields match "{fieldSearch}"</p>
          {/if}
        </dl>
        <p class="mt-3 select-none text-center text-ui-3xs text-muted-foreground">
          ← → to navigate records{onsave && !readonly ? ' · Enter saves a field · Esc reverts' : ''}
        </p>
      </div>
    {/if}
  </div>
</div>
