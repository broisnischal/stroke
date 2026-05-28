<script>
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { cn } from "$lib/utils.js";
  import { chatCompletionRaw } from "$lib/ai.js";
  import {
    aiProfiles,
    activeProfileId,
    aiSettings,
    saveProfile,
    deleteProfile,
    setActiveProfile,
    PROVIDERS,
    PROVIDER_MODELS,
    isAiConfigured,
  } from "$lib/stores/ai-settings.js";
  import { invoke } from "@tauri-apps/api/core";

  let { open = $bindable(false) } = $props();

  /** @param {string} url */
  async function openExternal(url) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // ── UI state ────────────────────────────────────────────────────────────────

  /** @type {'list' | 'add' | 'edit'} */
  let view = $state("list");
  /** @type {string | null} */
  let editingId = $state(null);

  // Form state
  let formProvider = $state("openrouter");
  let formModel = $state("");
  let formName = $state("");
  let formBaseUrl = $state("");
  let formApiKey = $state("");
  let showKey = $state(false);
  let showAdvanced = $state(false);

  /** @type {'idle' | 'testing' | 'ok' | 'error'} */
  let testState = $state("idle");
  let testMsg = $state("");
  let saving = $state(false);

  const provider = $derived(
    PROVIDERS.find((p) => p.id === formProvider) ?? PROVIDERS[0],
  );
  const activeProfile = $derived(
    $aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0],
  );
  const modelPresets = $derived(PROVIDER_MODELS[formProvider] ?? []);
  const isOllama = $derived(formProvider === "ollama");
  const isCustom = $derived(formProvider === "custom");
  const needsKey = $derived(!formApiKey && !isOllama && !isCustom);
  /** @param {string} providerId */
  function providerLabel(providerId) {
    return PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId;
  }

  /** @param {string} providerId */
  function providerMark(providerId) {
    const map = {
      openrouter: "OR",
      openai: "OA",
      anthropic: "AN",
      mistral: "MI",
      google: "GO",
      ollama: "OL",
      custom: "CU",
    };
    return map[providerId] ?? "AI";
  }

  /** @param {string} providerId */
  function providerMarkClass(providerId) {
    const map = {
      openrouter: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
      openai: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
      anthropic: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      mistral: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
      google: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      ollama: "bg-muted text-muted-foreground",
      custom: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    };
    return map[providerId] ?? "bg-muted text-muted-foreground";
  }

  function resetForm(providerId = "openrouter") {
    formProvider = providerId;
    const p = PROVIDERS.find((x) => x.id === providerId) ?? PROVIDERS[0];
    formBaseUrl = p.url;
    const presets = PROVIDER_MODELS[providerId] ?? [];
    formModel = presets[0]?.model ?? "";
    formName = "";
    formApiKey = "";
    showKey = false;
    showAdvanced = false;
    testState = "idle";
    testMsg = "";
  }

  function handleOpenChange(/** @type {boolean} */ next) {
    if (next) {
      view = "list";
      editingId = null;
      resetForm();
    }
  }

  function startAdd() {
    editingId = null;
    resetForm();
    view = "add";
  }

  /** @param {import('$lib/stores/ai-settings.js').ModelProfile} profile */
  async function startEdit(profile) {
    editingId = profile.id;
    formProvider = profile.provider;
    formBaseUrl = profile.baseUrl;
    formModel = profile.model;
    formName = profile.name;
    showKey = false;
    showAdvanced = profile.provider === "custom";
    testState = "idle";
    testMsg = "";
    try {
      formApiKey = await invoke("ai_load_key", { profileId: profile.id });
    } catch {
      formApiKey = "";
    }
    view = "edit";
  }

  /** @param {string} pid */
  function selectProvider(pid) {
    formProvider = pid;
    const p = PROVIDERS.find((x) => x.id === pid) ?? PROVIDERS[0];
    formBaseUrl = p.url;
    const presets = PROVIDER_MODELS[pid] ?? [];
    if (presets.length > 0) formModel = presets[0].model;
    testState = "idle";
    testMsg = "";
  }

  /** @param {string} model */
  function selectPreset(model) {
    formModel = model;
    testState = "idle";
    testMsg = "";
  }

  async function save() {
    if (!formModel.trim()) return;
    saving = true;
    try {
      const id = editingId ?? crypto.randomUUID();
      const name = formName.trim() || modelShortName(formModel);
      /** @type {import('$lib/stores/ai-settings.js').ModelProfile} */
      const profile = {
        id,
        name,
        provider: formProvider,
        baseUrl: formBaseUrl.trim() || (provider?.url ?? ""),
        model: formModel.trim(),
      };
      await saveProfile(profile, formApiKey);
      await setActiveProfile(id);
      view = "list";
    } finally {
      saving = false;
    }
  }

  /** @param {string | null} id */
  async function handleDelete(id) {
    if (!id) return;
    await deleteProfile(id);
    if (view === "edit" && editingId === id) view = "list";
  }

  async function testConnection() {
    if (testState === "testing") return;
    testState = "testing";
    testMsg = "";
    try {
      const settings = {
        baseUrl: formBaseUrl || (provider?.url ?? ""),
        apiKey: formApiKey,
        model: formModel,
      };
      const res = await chatCompletionRaw(
        settings,
        [{ role: "user", content: "Reply with the single word: ok" }],
        null,
      );
      if (res.content == null) throw new Error("Empty response");
      testState = "ok";
      testMsg = `Connected · ${formModel}`;
    } catch (e) {
      testState = "error";
      testMsg = String(/** @type {any} */ (e)?.message ?? e).slice(0, 200);
    }
  }

  /** @param {string} model */
  function modelShortName(model) {
    return model.split("/").pop()?.split(":")[0] ?? model;
  }

  const tagClass = /** @type {Record<string, string>} */ ({
    free: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    fast: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    smart: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    local: "bg-muted text-muted-foreground",
  });
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[30rem]">
    <Dialog.Header
      class="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3"
    >
      <div class="min-w-0">
        <Dialog.Title class="text-sm font-semibold">
          {#if view === "list"}AI Models{:else if view === "add"}Add model{:else}Edit
            model{/if}
        </Dialog.Title>
        {#if view !== "list"}
          <Dialog.Description class="text-[11px] text-muted-foreground">
            Configure provider, model, and credentials
          </Dialog.Description>
        {/if}
      </div>
      {#if view !== "list"}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 shrink-0 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onclick={() => {
            view = "list";
            editingId = null;
          }}
        >
          <ChevronRight class="size-3.5 rotate-180" />
          Back
        </Button>
      {/if}
    </Dialog.Header>

    <!-- ── LIST VIEW ──────────────────────────────────────────────────────── -->
    {#if view === "list"}
      <div class="app-scroll flex max-h-[min(70vh,36rem)] flex-col overflow-y-auto">
        {#if $aiProfiles.length === 0}
          <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p class="text-sm font-medium text-foreground">No models configured</p>
            <p class="text-xs text-muted-foreground">Add a model to get started with AI features.</p>
          </div>
        {:else}
          <div class="flex flex-col gap-0.5 p-2">
            {#each $aiProfiles as profile (profile.id)}
              {@const isActive = profile.id === $activeProfileId}
              <div
                class={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer",
                  isActive ? "bg-accent" : "hover:bg-accent/50"
                )}
                role="button"
                tabindex="0"
                onclick={() => void setActiveProfile(profile.id)}
                onkeydown={(e) => e.key === 'Enter' && void setActiveProfile(profile.id)}
              >
                <span
                  class={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold tracking-wide",
                    providerMarkClass(profile.provider),
                  )}
                >
                  {providerMark(profile.provider)}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-xs font-medium text-foreground">{profile.name}</span>
                  <span class="block truncate font-mono text-[10px] text-muted-foreground/70">{profile.model}</span>
                </span>
                {#if isActive}
                  <span class="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">Active</span>
                {/if}
                <button
                  type="button"
                  class="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                  onclick={(e) => { e.stopPropagation(); void startEdit(profile) }}
                >
                  Edit
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Add model button -->
        <div class="border-t border-border/40 p-2">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            onclick={startAdd}
          >
            <Plus class="size-3.5" />
            Add model
          </button>
        </div>
      </div>

      <!-- ── ADD / EDIT VIEW ───────────────────────────────────────────────── -->
    {:else}
      <div
        class="app-scroll flex max-h-[min(70vh,40rem)] flex-col gap-4 overflow-y-auto px-4 py-4"
      >
        <!-- Provider picker -->
        <div class="flex flex-col gap-2">
          <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Provider
          </p>
          <div class="grid grid-cols-4 gap-1.5">
            {#each PROVIDERS as p (p.id)}
              <button
                type="button"
                class={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-colors",
                  formProvider === p.id
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground"
                )}
                onclick={() => selectProvider(p.id)}
              >
                <span
                  class={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold tracking-wide",
                    providerMarkClass(p.id),
                  )}
                >
                  {providerMark(p.id)}
                </span>
                <span class="text-[10px] font-medium leading-tight">{p.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Model presets (not shown for custom) -->
        {#if modelPresets.length > 0}
          <div class="flex flex-col gap-2">
            <p
              class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60"
            >
              Model
            </p>
            <div class="grid grid-cols-2 gap-1.5">
              {#each modelPresets as preset (preset.model)}
                <button
                  type="button"
                  class={cn(
                    "flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    formModel === preset.model
                      ? "border-primary/40 bg-primary/5"
                      : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent/40",
                  )}
                  onclick={() => selectPreset(preset.model)}
                >
                  <span
                    class="min-w-0 truncate text-[11px] font-medium text-foreground"
                    >{preset.label}</span
                  >
                  <span
                    class={cn(
                      "shrink-0 rounded px-1 py-0.5 font-mono text-[9px]",
                      tagClass[preset.tag],
                    )}>{preset.tag}</span
                  >
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Custom model / endpoint fields -->
        <div class="flex flex-col gap-3">
          {#if isCustom || modelPresets.length === 0}
            <div class="flex flex-col gap-1.5">
              <label
                for="form-endpoint"
                class="text-ui-xs font-medium text-foreground"
                >Endpoint URL</label
              >
              <Input
                id="form-endpoint"
                class="h-8 font-mono text-ui-xs"
                placeholder="https://…/v1"
                bind:value={formBaseUrl}
              />
            </div>
          {/if}

          <div class="flex flex-col gap-1.5">
            <label
              for="form-model"
              class="text-ui-xs font-medium text-foreground"
              >{modelPresets.length > 0
                ? "Model (editable)"
                : "Model ID"}</label
            >
            <Input
              id="form-model"
              class="h-8 font-mono text-ui-xs"
              placeholder="provider/model-name"
              bind:value={formModel}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label
              for="form-name"
              class="text-ui-xs font-medium text-foreground">Display name</label
            >
            <Input
              id="form-name"
              class="h-8 text-ui-xs"
              placeholder={formModel ? modelShortName(formModel) : "My model"}
              bind:value={formName}
            />
          </div>

          {#if !isOllama}
            <div class="flex flex-col gap-1.5">
              <label
                for="form-key"
                class="text-ui-xs font-medium text-foreground"
              >
                API key
                <span class="ml-1 font-normal text-muted-foreground/60"
                  >(stored securely)</span
                >
              </label>
              <div class="relative flex items-center">
                <Input
                  id="form-key"
                  class="h-8 pr-8 font-mono text-ui-xs"
                  type={showKey ? "text" : "password"}
                  placeholder={isOllama ? "not required" : "sk-…"}
                  bind:value={formApiKey}
                />
                <button
                  type="button"
                  class="absolute right-2 text-muted-foreground/50 hover:text-foreground"
                  onclick={() => (showKey = !showKey)}
                  tabindex="-1"
                >
                  {#if showKey}<EyeOff class="size-3.5" />{:else}<Eye
                      class="size-3.5"
                    />{/if}
                </button>
              </div>
              {#if needsKey}
                <p
                  class="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
                >
                  <AlertTriangle class="size-3 shrink-0" />
                  API key required for this provider.
                  {#if provider?.keysUrl}
                    <button
                      type="button"
                      class="font-medium underline-offset-2 hover:underline"
                      onclick={() => openExternal(provider.keysUrl)}
                    >
                      Get one →
                    </button>
                  {/if}
                </p>
              {/if}
            </div>
          {/if}

          <!-- Advanced: custom endpoint for non-custom providers -->
          {#if !isCustom && !isOllama}
            <button
              type="button"
              class="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
              onclick={() => (showAdvanced = !showAdvanced)}
            >
              <ChevronRight
                class={cn(
                  "size-3 transition-transform",
                  showAdvanced && "rotate-90",
                )}
              />
              Custom endpoint
            </button>
            {#if showAdvanced}
              <div class="flex flex-col gap-1.5">
                <Input
                  class="h-8 font-mono text-ui-xs"
                  placeholder={provider?.url ?? ""}
                  bind:value={formBaseUrl}
                />
              </div>
            {/if}
          {/if}
        </div>

        <!-- Test result -->
        {#if testState === "ok"}
          <div
            class="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/8 px-3 py-2 text-ui-xs text-green-600 dark:text-green-400"
          >
            <Check class="size-3.5 shrink-0" /><span class="min-w-0 truncate"
              >{testMsg}</span
            >
          </div>
        {:else if testState === "error"}
          <div
            class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-ui-xs text-destructive"
          >
            <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span
              class="min-w-0 break-words">{testMsg}</span
            >
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3"
      >
        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-ui-xs"
            disabled={testState === "testing" || !formModel.trim()}
            onclick={testConnection}
          >
            {#if testState === "testing"}<Loader2
                class="size-3.5 animate-spin"
              />Testing…{:else}Test{/if}
          </Button>
          {#if view === "edit" && editingId}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5 text-ui-xs text-destructive hover:text-destructive"
              onclick={() => void handleDelete(editingId)}
              ><Trash2 class="size-3.5" /></Button
            >
          {/if}
        </div>
        <Button
          type="button"
          size="sm"
          class="h-8 gap-1.5 text-ui-xs"
          disabled={saving || !formModel.trim()}
          onclick={() => void save()}
        >
          {#if saving}<Loader2 class="size-3.5 animate-spin" />{/if}
          {view === "add" ? "Add model" : "Save"}
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
