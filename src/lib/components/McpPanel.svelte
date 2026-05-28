<script>
  import Server from "@lucide/svelte/icons/server";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import Power from "@lucide/svelte/icons/power";
  import PowerOff from "@lucide/svelte/icons/power-off";
  import Zap from "@lucide/svelte/icons/zap";
  import Bot from "@lucide/svelte/icons/bot";
  import Code2 from "@lucide/svelte/icons/code-2";
  import Wand2 from "@lucide/svelte/icons/wand-2";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { cn } from "$lib/utils.js";
  import { mcpStart, mcpStop, mcpStatus } from "$lib/api.js";

  let { open = $bindable(false), connected = false } = $props();

  /** @type {{ running: boolean, port: number, url: string, token: string } | null} */
  let status = $state(null);
  let toggling = $state(false);
  /** @type {string | null} */
  let copied = $state(null);

  $effect(() => {
    if (open) void refresh();
  });

  async function refresh() {
    try {
      status = await mcpStatus();
    } catch {
      status = null;
    }
  }

  async function toggle() {
    toggling = true;
    try {
      if (status?.running) {
        await mcpStop();
      } else {
        await mcpStart();
      }
      status = await mcpStatus();
    } catch (e) {
      console.error(e);
    } finally {
      toggling = false;
    }
  }

  const claudeConfig = $derived(
    status
      ? JSON.stringify(
          {
            mcpServers: {
              "db-studio": {
                url: status.url,
                headers: { Authorization: `Bearer ${status.token}` },
              },
            },
          },
          null,
          2,
        )
      : "",
  );

  const cursorConfig = $derived(
    status
      ? JSON.stringify(
          {
            mcpServers: {
              "db-studio": {
                url: status.url,
                headers: { Authorization: `Bearer ${status.token}` },
              },
            },
          },
          null,
          2,
        )
      : "",
  );

  const vscodeConfig = $derived(
    status
      ? JSON.stringify(
          {
            servers: {
              "db-studio": {
                type: "http",
                url: status.url,
                headers: { Authorization: `Bearer ${status.token}` },
              },
            },
          },
          null,
          2,
        )
      : "",
  );

  const cursorInstallUrl = $derived.by(() => {
    if (!status) return "";
    const cfg = JSON.stringify({
      url: status.url,
      headers: { Authorization: `Bearer ${status.token}` },
    });
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=db-studio&config=${btoa(cfg)}`;
  });

  const vscodeInstallUrl = $derived.by(() => {
    if (!status) return "";
    const cfg = JSON.stringify({
      name: "db-studio",
      type: "http",
      url: status.url,
      headers: { Authorization: `Bearer ${status.token}` },
    });
    return `vscode:mcp/install?${encodeURIComponent(cfg)}`;
  });

  const vscodeInsidersInstallUrl = $derived.by(() => {
    if (!status) return "";
    const cfg = JSON.stringify({
      name: "db-studio",
      type: "http",
      url: status.url,
      headers: { Authorization: `Bearer ${status.token}` },
    });
    return `vscode-insiders:mcp/install?${encodeURIComponent(cfg)}`;
  });

  async function installVia(url) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch (e) {
      console.error("Failed to open install URL:", e);
    }
  }

  /** @param {string} text @param {string} key */
  async function copy(text, key) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copied = key;
    setTimeout(() => {
      copied = null;
    }, 2000);
  }

  const clients = $derived(
    status
      ? [
          {
            id: "claude",
            name: "Claude Desktop",
            icon: Bot,
            iconClass: "bg-orange-500/10 text-orange-500",
            description: "Paste JSON into your Claude Desktop config file.",
            primaryLabel: "Copy config",
            primaryIcon: Copy,
            primaryAction: () => void copy(claudeConfig, "claude"),
            primaryCopied: () => copied === "claude",
            primaryCopiedLabel: "Copied",
            secondary: null,
            footnote: "", //~/Library/Application Support/Claude/claude_desktop_config.json
          },
          {
            id: "cursor",
            name: "Cursor",
            icon: Wand2,
            iconClass: "bg-blue-500/15 text-blue-500",
            description: "Install db-studio via Cursor’s MCP deep link.",
            primaryLabel: "Add to Cursor",
            primaryIcon: ExternalLink,
            primaryAction: () => void installVia(cursorInstallUrl),
            primaryDisabled: !cursorInstallUrl,
            secondaryLabel: "Copy JSON",
            secondaryIcon: Copy,
            secondaryAction: () => void copy(cursorConfig, "cursor"),
            secondaryCopied: () => copied === "cursor",
          },
          {
            id: "vscode",
            name: "VS Code",
            icon: Code2,
            iconClass: "bg-sky-500/15 text-sky-500",
            description: "Install via VS Code’s built-in MCP handler.",
            primaryLabel: "Add to VS Code",
            primaryIcon: ExternalLink,
            primaryAction: () => void installVia(vscodeInstallUrl),
            primaryDisabled: !vscodeInstallUrl,
            secondaryLabel: "VS Code Insiders",
            secondaryIcon: ExternalLink,
            secondaryAction: () => void installVia(vscodeInsidersInstallUrl),
          },
        ]
      : [],
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
  >
    <Dialog.Header class="shrink-0 space-y-0 border-b border-border px-6 py-5">
      <div class="flex items-start gap-3 pr-8">
        <div
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"
        >
          <Server class="size-4 text-muted-foreground" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <Dialog.Title class="text-base font-semibold leading-none"
            >MCP Server</Dialog.Title
          >
          <Dialog.Description
            class="text-sm leading-snug text-muted-foreground"
          >
            Connect Claude Desktop, Cursor, or VS Code. Port and token stay
            stable, configure once.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto [will-change:transform]">
      <div class="flex flex-col gap-3 border-b border-border px-6 py-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Label class="text-muted-foreground">Server</Label>
          {#if status?.running}
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0 text-xs font-medium text-green-600 dark:text-green-400"
            >
              <span class="size-1.5 animate-pulse rounded-full bg-green-500"
              ></span>
              Running on port {status.port}
            </span>
          {:else if status}
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              <span class="size-1.5 rounded-full bg-muted-foreground/40"></span>
              Stopped
            </span>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if status}
            <div
              class="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-border bg-muted/20 pl-3 pr-1 py-1.5"
            >
              <code
                class="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                >{status.url}</code
              >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="shrink-0"
                aria-label="Copy server URL"
                onclick={() => void copy(status?.url ?? "", "url")}
              >
                {#if copied === "url"}
                  <Check class="size-3.5 text-green-500" />
                {:else}
                  <Copy class="size-3.5" />
                {/if}
              </Button>
            </div>
          {:else}
            <div
              class="flex-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
            >
              Loading server status…
            </div>
          {/if}

          <Button
            type="button"
            variant={status?.running ? "outline" : "default"}
            size="sm"
            class="shrink-0 py-4"
            disabled={toggling || !connected || !status}
            onclick={() => void toggle()}
          >
            {#if toggling}
              <span
                class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              ></span>
              {status?.running ? "Stopping…" : "Starting…"}
            {:else if status?.running}
              <PowerOff class="size-3.5" />
              Stop
            {:else}
              <Power class="size-3.5" />
              Start
            {/if}
          </Button>
        </div>

        {#if status && !status.running}
          <p class="text-xs text-amber-600 dark:text-amber-400">
            Start the server before clients can connect. Install links still
            work for setup.
          </p>
        {/if}
      </div>

      {#if status}
        <section class="border-b border-border px-6 py-5">
          <Label class="mb-4 block">One click install</Label>

          <div class="grid gap-3 sm:grid-cols-3">
            {#each clients as client (client.id)}
              {@const Icon = client.icon}
              <div
                class="flex min-h-[11.5rem] flex-col rounded-xl border border-border bg-card p-4"
              >
                <div class="mb-3 flex items-center gap-2.5">
                  <div
                    class={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      client.iconClass,
                    )}
                  >
                    <Icon class="size-4" />
                  </div>
                  <span class="text-sm font-medium text-foreground"
                    >{client.name}</span
                  >
                </div>

                <p
                  class="mb-4 flex-1 text-xs leading-relaxed text-muted-foreground"
                >
                  {client.description}
                </p>

                <div class="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    class="w-full"
                    disabled={client.primaryDisabled}
                    onclick={client.primaryAction}
                  >
                    {#if client.primaryCopied?.()}
                      <Check class="size-3.5 text-primary-foreground" />
                      {client.primaryCopiedLabel ?? "Copied"}
                    {:else}
                      {@const PrimaryIcon = client.primaryIcon}
                      <PrimaryIcon class="size-3.5" />
                      {client.primaryLabel}
                    {/if}
                  </Button>

                  {#if client.secondaryLabel}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class="w-full"
                      onclick={client.secondaryAction}
                    >
                      {#if client.secondaryCopied?.()}
                        <Check class="size-3.5 text-green-500" />
                        Copied
                      {:else}
                        {@const SecondaryIcon = client.secondaryIcon}
                        <SecondaryIcon class="size-3.5" />
                        {client.secondaryLabel}
                      {/if}
                    </Button>
                  {:else if client.footnote}
                    <p
                      class="px-1 text-center font-mono text-[10px] leading-snug text-muted-foreground"
                      title={client.footnote}
                    >
                      {client.footnote}
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else}
        <div
          class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"
        >
          <div
            class="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/30"
          >
            <Server class="size-6 text-muted-foreground/40" />
          </div>
          <p class="max-w-xs text-sm text-muted-foreground">
            {connected
              ? "Loading server status…"
              : "Connect to a database first, then start the MCP server."}
          </p>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
