<script>
  import Server    from "@lucide/svelte/icons/server";
  import Copy      from "@lucide/svelte/icons/copy";
  import Check     from "@lucide/svelte/icons/check";
  import Power     from "@lucide/svelte/icons/power";
  import PowerOff  from "@lucide/svelte/icons/power-off";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import ShieldCheck  from "@lucide/svelte/icons/shield-check";
  import Bot       from "@lucide/svelte/icons/bot";
  import Code2     from "@lucide/svelte/icons/code-2";
  import Wand2     from "@lucide/svelte/icons/wand-2";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { cn } from "$lib/utils.js";
  import { mcpStart, mcpStop, mcpStatus, mcpSetReadonly } from "$lib/api.js";

  let { open = $bindable(false), connected = false } = $props();

  /** @type {{ running: boolean, port: number, url: string, token: string } | null} */
  let status   = $state(null);
  let toggling = $state(false);
  /** @type {string | null} */
  let copied   = $state(null);

  // Read-only mode - persisted to localStorage
  let readOnly = $state(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('stroke:mcp-readonly') === 'true'
      : false
  );

  $effect(() => {
    if (open) void refresh();
  });

  async function refresh() {
    try { status = await mcpStatus() } catch { status = null }
  }

  async function toggle() {
    toggling = true;
    try {
      if (status?.running) await mcpStop(); else await mcpStart();
      status = await mcpStatus();
    } catch (e) { console.error(e) }
    finally { toggling = false }
  }

  async function toggleReadOnly() {
    readOnly = !readOnly;
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('stroke:mcp-readonly', String(readOnly));
    try { await mcpSetReadonly(readOnly) } catch {}
  }

  // Sync read-only setting to backend when the dialog opens
  $effect(() => {
    if (open) mcpSetReadonly(readOnly).catch(() => {})
  })

  const claudeConfig  = $derived(status ? JSON.stringify({ mcpServers: { "stroke": { url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } }, null, 2) : '')
  const cursorConfig  = $derived(claudeConfig)
  const vscodeConfig  = $derived(status ? JSON.stringify({ servers: { "stroke": { type: "http", url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } }, null, 2) : '')

  const cursorInstallUrl = $derived.by(() => {
    if (!status) return ''
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=stroke&config=${btoa(JSON.stringify({ url: status.url, headers: { Authorization: `Bearer ${status.token}` } }))}`
  })
  const vscodeInstallUrl = $derived.by(() => {
    if (!status) return ''
    return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'stroke', type: 'http', url: status.url, headers: { Authorization: `Bearer ${status.token}` } }))}`
  })
  const vscodeInsidersUrl = $derived.by(() => {
    if (!status) return ''
    return vscodeInstallUrl.replace('vscode:', 'vscode-insiders:')
  })

  async function installVia(url) {
    try { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url) }
    catch {}
  }

  async function copy(text, key) {
    if (!text) return
    await navigator.clipboard.writeText(text)
    copied = key
    setTimeout(() => { copied = null }, 2000)
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="w-full max-w-xl gap-0 overflow-hidden rounded-2xl border-border/60 p-0 sm:max-w-xl">

    <!-- ── Header ── -->
    <div class="flex items-start justify-between border-b border-border/40 px-6 py-5">
      <div class="flex items-center gap-3.5">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/30">
          <Server class="size-4 text-foreground/70" />
        </div>
        <div>
          <Dialog.Title class="text-ui-lg font-semibold leading-none tracking-tight text-foreground">
            MCP Server
          </Dialog.Title>
          <p class="mt-1 text-ui-sm leading-snug text-muted-foreground/70">
            Connect Claude, Cursor, or VS Code to your database.
          </p>
        </div>
      </div>
    </div>

    <!-- ── Scrollable body ── -->
    <div class="flex flex-col gap-0 overflow-y-auto" style="max-height: 70vh">

      <!-- Server status + controls -->
      <div class="border-b border-border/30 px-6 py-4">
        <div class="flex items-center justify-between gap-3">
          <!-- URL pill -->
          {#if status}
            <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
              <code class="min-w-0 flex-1 truncate font-mono text-ui-xs text-foreground/80">{status.url}</code>
              <button
                type="button"
                class="shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-foreground"
                onclick={() => void copy(status?.url ?? '', 'url')}
                aria-label="Copy URL"
              >
                {#if copied === 'url'}
                  <Check class="size-3.5 text-green-500" />
                {:else}
                  <Copy class="size-3.5" />
                {/if}
              </button>
            </div>
          {:else}
            <div class="flex-1 rounded-lg border border-dashed border-border/40 px-3 py-2 text-ui-xs text-muted-foreground/50">
              {connected ? 'Loading…' : 'No database connected'}
            </div>
          {/if}

          <!-- Start / Stop -->
          <button
            type="button"
            class={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-ui-sm font-medium transition-colors",
              status?.running
                ? "border-border/50 bg-muted/30 text-foreground/70 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
              (toggling || !connected || !status) && "pointer-events-none opacity-40"
            )}
            disabled={toggling || !connected || !status}
            onclick={() => void toggle()}
          >
            {#if toggling}
              <span class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              {status?.running ? 'Stopping' : 'Starting'}
            {:else if status?.running}
              <PowerOff class="size-3.5" />
              Stop
            {:else}
              <Power class="size-3.5" />
              Start
            {/if}
          </button>
        </div>

        <!-- Status badge -->
        <div class="mt-2.5 flex items-center gap-2">
          {#if status?.running}
            <span class="inline-flex items-center gap-1.5 text-ui-2xs font-medium text-green-500">
              <span class="size-1.5 animate-pulse rounded-full bg-green-500"></span>
              Running on port {status.port}
            </span>
          {:else if status}
            <span class="inline-flex items-center gap-1.5 text-ui-2xs text-muted-foreground/45">
              <span class="size-1.5 rounded-full bg-muted-foreground/30"></span>
              Stopped
            </span>
          {/if}
        </div>
      </div>

      <!-- ── Read-only mode ── -->
      <div class="border-b border-border/30 px-6 py-4">
        <button
          type="button"
          class="flex w-full items-start gap-3 text-left"
          onclick={toggleReadOnly}
        >
          <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 ring-1 ring-border/25">
            <ShieldCheck class={cn("size-4", readOnly ? "text-amber-500" : "text-muted-foreground/50")} />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <span class="text-ui-sm font-medium text-foreground">Read-only mode</span>
              <!-- Toggle pill -->
              <div
                class={cn(
                  "flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors duration-200",
                  readOnly
                    ? "border-amber-500/40 bg-amber-500/20"
                    : "border-border/40 bg-muted/30"
                )}
              >
                <span
                  class={cn(
                    "size-3.5 rounded-full transition-transform duration-200",
                    readOnly ? "translate-x-4 bg-amber-500" : "translate-x-0 bg-muted-foreground/40"
                  )}
                ></span>
              </div>
            </div>
            <p class="mt-0.5 text-ui-xs leading-snug text-muted-foreground/55">
              {readOnly
                ? 'Only SELECT queries are permitted. Write operations are blocked.'
                : 'All SQL operations are allowed. Enable to restrict the agent to reads only.'}
            </p>
          </div>
        </button>
      </div>

      <!-- ── Client cards ── -->
      {#if status}
        <div class="px-6 py-5">
          <p class="mb-4 text-ui-2xs font-semibold uppercase tracking-widest text-muted-foreground/40">
            Connect a client
          </p>

          <div class="flex flex-col gap-2.5">
            <!-- Claude Desktop -->
            <div class="flex items-center gap-4 rounded-xl border border-border/40 bg-muted/[0.07] px-4 py-3.5 transition-colors hover:bg-muted/15">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/30">
                <Bot class="size-4 text-foreground/70" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-ui-sm font-medium text-foreground">Claude Desktop</p>
                <p class="mt-0.5 text-ui-2xs text-muted-foreground/55">Paste JSON into your config file</p>
              </div>
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-ui-xs font-medium text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                onclick={() => void copy(claudeConfig, 'claude')}
              >
                {#if copied === 'claude'}
                  <Check class="size-3 text-green-500" />
                  Copied
                {:else}
                  <Copy class="size-3" />
                  Copy config
                {/if}
              </button>
            </div>

            <!-- Cursor -->
            <div class="flex items-center gap-4 rounded-xl border border-border/40 bg-muted/[0.07] px-4 py-3.5 transition-colors hover:bg-muted/15">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/30">
                <Wand2 class="size-4 text-foreground/70" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-ui-sm font-medium text-foreground">Cursor</p>
                <p class="mt-0.5 text-ui-2xs text-muted-foreground/55">Install via Cursor's MCP deep link</p>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-ui-xs font-medium text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                  onclick={() => void installVia(cursorInstallUrl)}
                >
                  <ExternalLink class="size-3" />
                  Add
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-ui-xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                  onclick={() => void copy(cursorConfig, 'cursor')}
                >
                  {#if copied === 'cursor'}
                    <Check class="size-3 text-green-500" />
                  {:else}
                    <Copy class="size-3" />
                  {/if}
                </button>
              </div>
            </div>

            <!-- VS Code -->
            <div class="flex items-center gap-4 rounded-xl border border-border/40 bg-muted/[0.07] px-4 py-3.5 transition-colors hover:bg-muted/15">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/30">
                <Code2 class="size-4 text-foreground/70" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-ui-sm font-medium text-foreground">VS Code</p>
                <p class="mt-0.5 text-ui-2xs text-muted-foreground/55">Install via built-in MCP handler</p>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-ui-xs font-medium text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                  onclick={() => void installVia(vscodeInstallUrl)}
                >
                  <ExternalLink class="size-3" />
                  VS Code
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-ui-xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                  onclick={() => void installVia(vscodeInsidersUrl)}
                >
                  <ExternalLink class="size-3" />
                  <span class="text-ui-2xs">Insiders</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      {:else if connected}
        <div class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div class="flex size-12 items-center justify-center rounded-2xl border border-border/30 bg-muted/20">
            <Server class="size-5 text-muted-foreground/30" />
          </div>
          <p class="text-ui-sm text-muted-foreground/60">Loading server status…</p>
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div class="flex size-12 items-center justify-center rounded-2xl border border-border/30 bg-muted/20">
            <Server class="size-5 text-muted-foreground/30" />
          </div>
          <p class="max-w-[220px] text-ui-sm text-muted-foreground/60">
            Connect to a database first, then start the MCP server.
          </p>
        </div>
      {/if}

    </div>
  </Dialog.Content>
</Dialog.Root>
