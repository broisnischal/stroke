<script>
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Link from '@lucide/svelte/icons/link'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right'
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right'
  import ExternalLink from '@lucide/svelte/icons/external-link'

  /**
   * @typedef {{ name: string, dataType: string, isNullable: boolean,
   *   columnDefault: string|null, foreignKey: string|null,
   *   fkConstraintName: string|null, ordinalPosition: number }} Col
   * @typedef {{ name: string, columns: Col[], pkCols: Set<string> }} TableMeta
   */

  let {
    tableName = '',
    fromCol   = '',
    toCol     = '',
    direction = /** @type {'in'|'out'} */ ('out'),
    depth     = 1,
    path      = '',
    /** @type {Map<string, TableMeta>} */
    tableMeta = new Map(),
    /** @type {Map<string, {col:string, refTable:string, refCol:string}[]>} */
    outbound  = new Map(),
    /** @type {Map<string, {fromTable:string, fromCol:string, refCol:string}[]>} */
    inbound   = new Map(),
    /** @type {Set<string>} */
    expanded  = new Set(),
    /** @type {Set<string>} */
    showCols  = new Set(),
    toggleExpand = /** @type {(k:string)=>void} */ (() => {}),
    toggleCols   = /** @type {(k:string)=>void} */ (() => {}),
    onfocustable = /** @type {(name:string)=>void} */ (() => {}),
    onopentable  = /** @type {((schema:string, table:string)=>void)|undefined} */ (undefined),
    activeSchema = 'public',
  } = $props()

  const meta    = $derived(tableMeta.get(tableName))
  const nodeOut = $derived(outbound.get(tableName) ?? [])
  const nodeIn  = $derived(inbound.get(tableName) ?? [])
  const hasMore = $derived(depth < 5 && (nodeOut.length > 0 || nodeIn.length > 0))

  const expKey  = `${path}:${depth}`
  const colKey  = `cols:${path}:${depth}`
  const isOpen  = $derived(expanded.has(expKey))
  const colsOpen = $derived(showCols.has(colKey))
  const isOut   = direction === 'out'

  // Visited tables in the current path (to detect circular refs)
  const visited = $derived(new Set(path.split(/[><:]/g).filter(Boolean)))
</script>

<div class="overflow-hidden rounded-lg border {isOut ? 'border-blue-500/20 bg-blue-500/3' : 'border-green-500/20 bg-green-500/3'}">
  <!-- Header row -->
  <div class="flex items-center gap-2 px-3 py-2">
    <!-- Direction + relation label -->
    <div class="flex shrink-0 items-center gap-1.5">
      {#if isOut}
        <ArrowUpRight class="size-3.5 text-blue-400/60" />
      {:else}
        <ArrowDownRight class="size-3.5 text-green-400/60" />
      {/if}
      <span class="font-mono text-[9px] text-muted-foreground/50">
        {isOut ? `${fromCol} → ${tableName}.${toCol}` : `${tableName}.${fromCol} → ${toCol}`}
      </span>
    </div>

    <!-- Table name — click to jump to root -->
    <button
      type="button"
      class="min-w-0 flex-1 truncate text-left font-mono text-ui-xs font-semibold hover:underline {isOut ? 'text-blue-300/90' : 'text-green-300/90'}"
      onclick={() => onfocustable(tableName)}
    >{tableName}</button>

    <div class="flex shrink-0 items-center gap-1">
      <!-- Toggle columns -->
      {#if meta}
        <button
          type="button"
          class="inline-flex h-5 items-center gap-0.5 rounded px-1.5 font-mono text-[9px] text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
          onclick={() => toggleCols(colKey)}
        >{colsOpen ? '−' : '+'}{meta.columns.length}c</button>
      {/if}

      <!-- Toggle expand -->
      {#if hasMore}
        <button
          type="button"
          class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
          onclick={() => toggleExpand(expKey)}
          title="{isOpen ? 'Collapse' : 'Expand'} relationships"
        >
          {#if isOpen}<ChevronDown class="size-3" />{:else}<ChevronRight class="size-3" />{/if}
        </button>
      {:else}
        <span class="size-5"></span>
      {/if}

      <!-- Open table -->
      <button
        type="button"
        class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => onopentable?.(activeSchema, tableName)}
        title="Open table"
      ><ExternalLink class="size-3" /></button>
    </div>
  </div>

  <!-- Columns panel -->
  {#if colsOpen && meta}
    <div class="border-t border-border/20 bg-background/40 px-3 py-1.5">
      {#each meta.columns as col (col.name)}
        {@const isPk = meta.pkCols.has(col.name)}
        {@const isFk = !!col.foreignKey}
        <div class="flex items-center gap-1.5 py-[2px]">
          {#if isPk}<KeyRound class="size-2.5 shrink-0 text-amber-400/70" />
          {:else if isFk}<Link class="size-2.5 shrink-0 text-blue-400/50" />
          {:else}<span class="size-2.5 shrink-0"></span>{/if}
          <span class="font-mono text-[9px] {isPk ? 'text-amber-300/80' : isFk ? 'text-blue-300/60' : 'text-foreground/55'}">{col.name}</span>
          <span class="ml-auto font-mono text-[8px] text-muted-foreground/30">{col.dataType}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Expanded children (recursive) -->
  {#if isOpen && hasMore}
    <div class="border-t border-border/20 bg-background/30 p-2">
      {@const shared = { tableMeta, outbound, inbound, expanded, showCols, toggleExpand, toggleCols, onfocustable, onopentable, activeSchema }}

      {#if nodeOut.length > 0}
        <div class="mb-1 px-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">References</div>
        <div class="flex flex-col gap-1.5 pl-2">
          {#each nodeOut as rel (rel.col)}
            {@const childPath = `${path}>${rel.refTable}:${rel.col}`}
            {#if !visited.has(rel.refTable) || depth < 3}
              <svelte:self tableName={rel.refTable} fromCol={rel.col} toCol={rel.refCol}
                direction="out" depth={depth + 1} path={childPath} {...shared} />
            {:else}
              <div class="flex items-center gap-2 rounded border border-border/20 px-3 py-1 font-mono text-[9px] text-muted-foreground/40">
                <Link class="size-2.5" />{rel.refTable} (circular)
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      {#if nodeIn.length > 0}
        {#if nodeOut.length > 0}<div class="my-1.5 border-t border-border/20"></div>{/if}
        <div class="mb-1 px-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Referenced by</div>
        <div class="flex flex-col gap-1.5 pl-2">
          {#each nodeIn as rel (`${rel.fromTable}${rel.fromCol}`)}
            {@const childPath = `${path}<${rel.fromTable}:${rel.fromCol}`}
            {#if !visited.has(rel.fromTable) || depth < 3}
              <svelte:self tableName={rel.fromTable} fromCol={rel.fromCol} toCol={rel.refCol}
                direction="in" depth={depth + 1} path={childPath} {...shared} />
            {:else}
              <div class="flex items-center gap-2 rounded border border-border/20 px-3 py-1 font-mono text-[9px] text-muted-foreground/40">
                <Link class="size-2.5" />{rel.fromTable} (circular)
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
