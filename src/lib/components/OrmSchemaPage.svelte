<script>
  // The live database, read as ORM code.
  //
  // The point of this tab is the shape of the schema, not its DDL: model names,
  // the field types you would actually type, and relations spelled out on both
  // sides. It introspects once (three schema-wide calls, no per-table fan-out)
  // and re-renders locally when you switch between Prisma and Drizzle, so the
  // toggle is instant even on a hundred-table schema.
  import MonacoTextView from './MonacoTextView.svelte'
  import Icon from './Icon.svelte'
  import DbIcon from './DbIcon.svelte'
  import TabLoading from './TabLoading.svelte'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import { getSchemaColumnStructure, listIndexes, listEnums, listTables, saveExportAs } from '$lib/api.js'
  import {
    buildOrmSchemaModel, renderPrismaSchema, renderDrizzleSchema,
    PRISMA_ENGINES, DRIZZLE_ENGINES,
  } from '$lib/orm-schema.js'
  import { cn } from '$lib/utils.js'

  let {
    /** Schema to describe. */
    schema = 'public',
    /** Saved-connection type: `postgres`, `mysql`, `sqlite`, … */
    dbType = 'postgres',
    /** Identity of the live connection. Two databases can both be `public` on
     *  Postgres, so this is what tells one session's schema from another's. */
    connectionId = '',
  } = $props()

  const TARGETS = [
    { id: 'prisma',  label: 'Prisma',  engines: PRISMA_ENGINES,  ext: 'prisma', file: 'schema.prisma' },
    { id: 'drizzle', label: 'Drizzle', engines: DRIZZLE_ENGINES, ext: 'ts',     file: 'schema.ts' },
  ]

  let target  = $state(/** @type {'prisma'|'drizzle'} */ ('prisma'))
  let model   = $state(/** @type {import('$lib/orm-schema.js').OrmSchemaModel | null} */ (null))
  let loading = $state(true)
  let error   = $state('')
  let copied  = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let copyTimer

  const active    = $derived(TARGETS.find((t) => t.id === target) ?? TARGETS[0])
  const supported = $derived(active.engines.includes(dbType))

  const code = $derived.by(() => {
    if (!model || !supported) return ''
    try {
      return target === 'prisma' ? renderPrismaSchema(model) : renderDrizzleSchema(model)
    } catch (e) {
      // A generator failure must not blank the tab — say so in the editor.
      return `// Could not render this schema as ${active.label}: ${String(e)}\n`
    }
  })

  const tableCount = $derived(model?.tables.length ?? 0)

  // Monaco has no Prisma grammar; its DSL is close enough to Rust's block syntax
  // that the highlighter reads correctly, and far better than plaintext.
  const language = $derived(target === 'prisma' ? 'rust' : 'typescript')

  $effect(() => {
    // Follows the connection, not just the schema name: switching databases
    // usually lands on `public` again, so keying on schema alone left the
    // previous database's models on screen. A schema altered in place is picked
    // up with the Refresh button.
    void load(`${connectionId} ${schema} ${dbType}`)
  })

  let loadToken = ''
  async function load(key) {
    if (key === loadToken) return
    // Drop the previous database's models immediately — showing them under a new
    // connection's name is worse than showing a spinner.
    loadToken = key
    model = null
    loading = true
    error = ''
    try {
      // Enums and the table list are best-effort: engines without them (SQLite,
      // MySQL) must still produce a schema.
      const [structures, indexes, enums, tables] = await Promise.all([
        getSchemaColumnStructure(schema),
        listIndexes(schema).catch(() => []),
        listEnums(schema).catch(() => []),
        listTables(schema).catch(() => []),
      ])
      if (key !== loadToken) return // a newer load started
      model = buildOrmSchemaModel({ schema, dbType, structures, indexes, enums, tables })
    } catch (e) {
      if (key !== loadToken) return
      error = String(e)
      model = null
    } finally {
      if (key === loadToken) loading = false
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      copied = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied = false), 1600)
    } catch (e) {
      toast.error('Could not copy', { description: String(e) })
    }
  }

  async function saveCode() {
    try {
      const path = await saveExportAs(code, active.file, {
        name: active.label,
        extensions: [active.ext],
      })
      if (!path) return // dialog cancelled
      toast.success(`Exported ${active.label} schema`, { description: `Saved to ${path}` })
    } catch (e) {
      toast.error('Export failed', { description: String(e) })
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
    <!-- Target switch: the same schema, in either ORM's dialect. -->
    <div class="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/40 p-0.5">
      {#each TARGETS as t (t.id)}
        <button
          type="button"
          onclick={() => (target = /** @type {'prisma'|'drizzle'} */ (t.id))}
          class={cn(
            'inline-flex h-6 items-center gap-1.5 rounded px-2 text-ui-xs transition-colors',
            target === t.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <DbIcon id={t.id} class="size-3.5 shrink-0" />
          {t.label}
        </button>
      {/each}
    </div>

    <span class="min-w-0 truncate font-mono text-ui-xs text-muted-foreground">
      {schema}{#if tableCount}<span class="text-muted-foreground/50"> · {tableCount} {tableCount === 1 ? 'table' : 'tables'}</span>{/if}
    </span>

    <span class="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        onclick={() => { loadToken = ''; void load(`${connectionId} ${schema} ${dbType} ${Date.now()}`) }}
        title="Read the schema again"
        class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Icon name="refresh-cw" class={cn('size-3.5 shrink-0', loading && 'animate-spin')} />
        Refresh
      </button>
      <button
        type="button"
        onclick={saveCode}
        disabled={!code}
        title={`Save as ${active.file}`}
        class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Icon name="download" class="size-3.5 shrink-0" />
        Save
      </button>
      <button
        type="button"
        onclick={copyCode}
        disabled={!code}
        title={`Copy ${active.label} schema`}
        class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Icon name={copied ? 'check' : 'copy'} class="size-3.5 shrink-0" />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  </div>

  {#if error}
    <div class="flex min-h-0 flex-1 items-center justify-center p-8">
      <div class="max-w-md text-center">
        <Icon name="alert-circle" class="mx-auto size-5 text-destructive/70" />
        <p class="mt-2 text-ui-sm text-foreground">Couldn't read this schema</p>
        <p class="mt-1 text-ui-xs text-muted-foreground">{error}</p>
      </div>
    </div>
  {:else if !supported}
    <div class="flex min-h-0 flex-1 items-center justify-center p-8">
      <div class="max-w-md text-center">
        <DbIcon id={active.id} class="mx-auto size-6 text-muted-foreground/40" />
        <p class="mt-2 text-ui-sm text-foreground">{active.label} doesn't support this engine</p>
        <p class="mt-1 text-ui-xs text-muted-foreground">
          {active.label} has no {dbType} driver, so there's no schema to write.
          {#if TARGETS.some((t) => t.id !== active.id && t.engines.includes(dbType))}
            Switch to {TARGETS.find((t) => t.id !== active.id)?.label} above.
          {/if}
        </p>
      </div>
    </div>
  {:else if loading && !model}
    <TabLoading />
  {:else if tableCount === 0}
    <div class="flex min-h-0 flex-1 items-center justify-center p-8">
      <p class="text-ui-sm text-muted-foreground">No tables in <span class="font-mono">{schema}</span>.</p>
    </div>
  {:else}
    <MonacoTextView text={code} {language} wordWrap="off" />
  {/if}
</div>
