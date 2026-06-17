<script>
  import { virtualColumnsStore } from '$lib/stores/virtual-columns.js'
  import { templateRefs, bindExpr, FN_SNIPPETS } from '$lib/virtual-column.js'
  import ResizeHandle from './ResizeHandle.svelte'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Check from '@lucide/svelte/icons/check'
  import X from '@lucide/svelte/icons/x'
  import Eye from '@lucide/svelte/icons/eye'
  import EyeOff from '@lucide/svelte/icons/eye-off'
  import Search from '@lucide/svelte/icons/search'
  import FunctionSquare from '@lucide/svelte/icons/function-square'
  import { cn } from '$lib/utils.js'

  /**
   * @type {{
   *   schema: string,
   *   tableName: string,
   *   columns?: {name: string, dataType?: string}[],
   *   rows?: unknown[][],
   *   nameToIdx?: Map<string,number>,
   *   onclose: () => void
   * }}
   */
  let { schema, tableName, columns = [], rows = [], nameToIdx, onclose } = $props()

  // ── Resizable width ────────────────────────────────────────────────────────
  const MIN_W = 260
  const MAX_W = 520
  const DEFAULT_W = 320

  function loadWidth() {
    try { return Math.min(MAX_W, Math.max(MIN_W, Number(localStorage.getItem('stroke:vcol-panel-w') || DEFAULT_W))) }
    catch { return DEFAULT_W }
  }
  let panelWidth = $state(loadWidth())
  let resizeStartWidth = 0

  function saveWidth(w) {
    try { localStorage.setItem('stroke:vcol-panel-w', String(w)) } catch {}
  }

  const tableKey   = $derived(`${schema}.${tableName}`)
  const vcols      = $derived($virtualColumnsStore[tableKey] ?? [])
  const fnGroups   = $derived(
    ['String', 'Math', 'Logic'].map(g => ({
      label: g,
      fns: FN_SNIPPETS.filter(f => f.group === g),
    }))
  )

  /** @type {string|null} */
  let editId    = $state(null)
  let formOpen  = $state(false)
  let draftName = $state('')
  let draftExpr = $state('')

  // Column search inside the form
  let colSearch = $state('')
  const filteredColumns = $derived(
    colSearch.trim()
      ? columns.filter(c => c.name.toLowerCase().includes(colSearch.toLowerCase()))
      : columns
  )

  const draftRefs = $derived(templateRefs(draftExpr))
  const badRefs   = $derived(draftRefs.filter(r => !columns.some(c => c.name === r)))
  const canSave   = $derived(draftName.trim().length > 0 && draftExpr.trim().length > 0 && badRefs.length === 0)

  /** Evaluate expr for a preview row using the real evaluator */
  function preview(expr, row) {
    if (!row || !nameToIdx) return '—'
    try {
      const fn = bindExpr(expr, nameToIdx)
      const val = fn(row)
      return val === '' ? '(empty)' : val
    } catch { return '—' }
  }

  const previewRows = $derived(rows.slice(0, 2))

  function openAdd() {
    editId = null; draftName = ''; draftExpr = ''; colSearch = ''; formOpen = true
  }
  function openEdit(col) {
    editId = col.id; draftName = col.name; draftExpr = col.expression; colSearch = ''; formOpen = true
  }
  function save() {
    if (!canSave) return
    const name = draftName.trim(), expression = draftExpr.trim()
    if (editId) virtualColumnsStore.patch(tableKey, editId, { name, expression })
    else        virtualColumnsStore.add(tableKey, { name, expression, enabled: true })
    formOpen = false; editId = null
  }
  function cancelForm() { formOpen = false; editId = null }

  /** @type {HTMLTextAreaElement|null} */
  let exprEl = $state(null)

  /** Insert text at caret; cursor = offset from insert start, null = after insert */
  function insertAt(text, cursor) {
    if (!exprEl) { draftExpr += text; return }
    const start = exprEl.selectionStart ?? draftExpr.length
    const end   = exprEl.selectionEnd   ?? draftExpr.length
    draftExpr   = draftExpr.slice(0, start) + text + draftExpr.slice(end)
    const pos   = cursor !== null ? start + cursor : start + text.length
    requestAnimationFrame(() => { exprEl?.setSelectionRange(pos, pos); exprEl?.focus() })
  }

  function insertCol(colName) { insertAt(`{${colName}}`, null) }
  function insertFn(snip)     { insertAt(snip.insert, snip.cursor) }
</script>

<!-- Resize handle sits outside the panel div so it doesn't clip -->
<ResizeHandle
  axis="x"
  edge="start"
  onresizestart={() => { resizeStartWidth = panelWidth }}
  onresize={(dx) => { panelWidth = Math.min(MAX_W, Math.max(MIN_W, resizeStartWidth + dx)) }}
  onresizeend={() => saveWidth(panelWidth)}
/>

<div
  class="flex h-full shrink-0 flex-col border-l border-border/40 bg-panel text-[12px]"
  style="width: {panelWidth}px"
>

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border/30 px-3">
    <FunctionSquare class="size-3.5 shrink-0 text-primary/60" />
    <span class="flex-1 text-[12px] font-semibold tracking-tight text-foreground">Virtual columns</span>
    <span class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">{tableName}</span>
    <button
      type="button"
      class="flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground"
      onclick={onclose}
    ><X class="size-3" /></button>
  </div>

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">

    <!-- ── Edit / add form ─────────────────────────────────────────────── -->
    {#if formOpen}
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">

        <!-- Section label -->
        <div class="px-3 pt-3 pb-2">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45">
            {editId ? 'Edit column' : 'New column'}
          </span>
        </div>

        <!-- Name -->
        <div class="px-3 pb-3">
          <label class="block">
            <span class="mb-1.5 block text-[11px] font-medium text-muted-foreground/70">Name</span>
            <input
              type="text"
              bind:value={draftName}
              placeholder="full_url"
              class="w-full rounded-md border border-border/30 bg-background/60 px-2.5 py-1.5 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/25 focus:border-primary/40"
            />
          </label>
        </div>

        <!-- Expression -->
        <div class="px-3 pb-3">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-[11px] font-medium text-muted-foreground/70">Expression</span>
            <span class="text-[10px] text-muted-foreground/35">{'{ col }'} for columns</span>
          </div>
          <textarea
            bind:this={exprEl}
            bind:value={draftExpr}
            rows={3}
            spellcheck={false}
            placeholder={"https://cdn.com/{file_key}"}
            class="w-full resize-none rounded-md border border-border/30 bg-background/60 px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/25 focus:border-primary/40"
          ></textarea>
          {#if badRefs.length > 0}
            <p class="mt-1 text-[10px] text-destructive/80">Unknown: {badRefs.map(r => `{${r}}`).join(', ')}</p>
          {/if}
        </div>

        <!-- Searchable columns -->
        {#if columns.length > 0}
          <div class="px-3 pb-3">
            <p class="mb-1.5 text-[11px] font-medium text-muted-foreground/70">Columns</p>
            <!-- Search input -->
            <div class="mb-1.5 flex items-center gap-1.5 rounded-md border border-border/30 bg-background/50 px-2 py-1">
              <Search class="size-3 shrink-0 text-muted-foreground/35" />
              <input
                type="text"
                bind:value={colSearch}
                placeholder="Search columns…"
                class="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/30"
                autocomplete="off"
                spellcheck="false"
              />
              {#if colSearch}
                <button
                  type="button"
                  class="flex size-3.5 items-center justify-center rounded text-muted-foreground/35 hover:text-muted-foreground"
                  onclick={() => { colSearch = '' }}
                ><X class="size-2.5" /></button>
              {/if}
            </div>
            <!-- Column list -->
            <div class="max-h-36 overflow-y-auto rounded-md border border-border/20 bg-background/30">
              {#if filteredColumns.length === 0}
                <p class="px-2.5 py-2 text-[10px] text-muted-foreground/35">No columns match</p>
              {:else}
                {#each filteredColumns as col (col.name)}
                  <button
                    type="button"
                    class={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40",
                      draftRefs.includes(col.name)
                        ? "bg-primary/8 text-primary"
                        : "text-foreground/80"
                    )}
                    onclick={() => insertCol(col.name)}
                  >
                    <span class="min-w-0 flex-1 truncate font-mono text-[11px]">{col.name}</span>
                    {#if draftRefs.includes(col.name)}
                      <Check class="size-2.5 shrink-0 text-primary/60" />
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {/if}

        <!-- Function palette -->
        <div class="px-3 pb-3">
          <p class="mb-1.5 text-[11px] font-medium text-muted-foreground/70">Functions</p>
          <div class="flex flex-col gap-1.5">
            {#each fnGroups as group}
              <div class="flex flex-wrap items-center gap-1">
                <span class="w-9 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/30">{group.label}</span>
                {#each group.fns as fn}
                  <button
                    type="button"
                    class="rounded bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    onclick={() => insertFn(fn)}
                  >{fn.label}</button>
                {/each}
              </div>
            {/each}
          </div>
        </div>

        <!-- Live preview -->
        {#if draftExpr.trim() && previewRows.length > 0}
          <div class="mx-3 mb-3 rounded-md border border-border/20 bg-muted/10">
            <div class="border-b border-border/15 px-2.5 py-1">
              <span class="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">Preview</span>
            </div>
            {#each previewRows as row, i}
              <div class="flex items-center gap-2 px-2.5 py-1.5 {i > 0 ? 'border-t border-border/10' : ''}">
                <span class="shrink-0 font-mono text-[9px] text-muted-foreground/30">#{i+1}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/70">{preview(draftExpr, row)}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Actions -->
        <div class="flex gap-2 px-3 pb-4">
          <button
            type="button"
            onclick={save}
            disabled={!canSave}
            class="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-medium text-primary-foreground transition-opacity disabled:opacity-35"
          >
            <Check class="size-3" /> Save
          </button>
          <button
            type="button"
            onclick={cancelForm}
            class="inline-flex h-7 items-center justify-center rounded-md border border-border/30 px-3 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>

    {:else}
      <!-- ── Column list ──────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto">
        {#if vcols.length === 0}
          <div class="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <div class="flex size-10 items-center justify-center rounded-lg border border-border/25 bg-muted/15">
              <FunctionSquare class="size-5 text-muted-foreground/25" />
            </div>
            <div>
              <p class="text-[12px] font-medium text-muted-foreground/55">No virtual columns</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground/35">Compute values from existing columns using templates and functions.</p>
            </div>
          </div>
        {:else}
          <div class="py-1">
            {#each vcols as col (col.id)}
              {@const firstRowVal = rows[0] ? preview(col.expression, rows[0]) : null}
              <div class={cn(
                "group relative flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/15",
                !col.enabled && "opacity-40"
              )}>
                <!-- Eye toggle -->
                <button
                  type="button"
                  class={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                    col.enabled
                      ? "text-primary/60 hover:bg-primary/10 hover:text-primary"
                      : "text-muted-foreground/30 hover:bg-muted hover:text-foreground"
                  )}
                  title={col.enabled ? 'Disable' : 'Enable'}
                  onclick={() => virtualColumnsStore.patch(tableKey, col.id, { enabled: !col.enabled })}
                >
                  {#if col.enabled}
                    <Eye class="size-3.5" />
                  {:else}
                    <EyeOff class="size-3.5" />
                  {/if}
                </button>

                <!-- Content -->
                <div class="min-w-0 flex-1 overflow-hidden">
                  <div class="flex items-baseline gap-1.5">
                    <span class="shrink-0 font-mono text-[12px] font-medium text-foreground">{col.name}</span>
                    {#if firstRowVal && col.enabled}
                      <span class="min-w-0 truncate font-mono text-[10px] text-primary/55">{firstRowVal}</span>
                    {/if}
                  </div>
                  <p class="truncate font-mono text-[10px] text-muted-foreground/35">{col.expression}</p>
                </div>

                <!-- Hover actions -->
                <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    class="flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground"
                    onclick={() => openEdit(col)}
                  ><Pencil class="size-3" /></button>
                  <button
                    type="button"
                    class="flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => virtualColumnsStore.remove(tableKey, col.id)}
                  ><Trash2 class="size-3" /></button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- ── Footer ──────────────────────────────────────────────────────── -->
      <div class="shrink-0 border-t border-border/25 px-3 py-2.5">
        <button
          type="button"
          onclick={openAdd}
          class="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/40 py-1.5 text-[11px] text-muted-foreground/55 transition-colors hover:border-primary/30 hover:text-primary"
        >
          <Plus class="size-3" /> Add virtual column
        </button>
      </div>
    {/if}
  </div>
</div>
