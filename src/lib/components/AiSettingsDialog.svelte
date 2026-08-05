<script>
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Route from "@lucide/svelte/icons/route";
  import HardDrive from "@lucide/svelte/icons/hard-drive";
  import Waypoints from "@lucide/svelte/icons/waypoints";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import BrandIcon from "$lib/components/BrandIcon.svelte";
  import { hasBrand } from "$lib/brand-icons.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { cn } from "$lib/utils.js";
  import { chatCompletionRaw, fetchModelIds } from "$lib/ai.js";
  import {
    aiProfiles,
    activeProfileId,
    saveProfile,
    deleteProfile,
    setActiveProfile,
    PROVIDERS,
    PROVIDER_MODELS,
  } from "$lib/stores/ai-settings.js";
  import { invoke } from "@tauri-apps/api/core";
  import CopilotLogin from "$lib/components/CopilotLogin.svelte";
  import { fetchCopilotModels } from "$lib/copilot.js";

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

  /** @type {'list' | 'form'} */
  let view = $state("list");
  /** @type {string | null} */
  let editingId = $state(null);

  // Stepper: 0 = provider, 1 = model, 2 = credentials
  let step = $state(0);
  const STEPS = ["Provider", "Model", "Credentials"];

  // Selection styling shared by the provider and model grids, so the two steps read
  // as one system. An idle card is a hairline that firms up on hover; a selected one
  // is a soft tinted surface with an inset rim rather than a saturated stroke around
  // a flat fill — the stroke was the loudest thing in the dialog.
  const CARD_BASE =
    "flex w-full items-center gap-2.5 rounded-lg border text-left outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/40";
  const CARD_SELECTED =
    "border-primary/35 bg-primary/[0.07] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.14)]";
  const CARD_IDLE =
    "border-border/40 text-foreground/85 hover:border-border/70 hover:bg-muted/30 hover:text-foreground";

  /** Marks for the providers brand-icons.js has no logo for. */
  const PROVIDER_ICON_FALLBACK = /** @type {Record<string, any>} */ ({
    stroke: Sparkles,
    openrouter: Route,
    ollama: HardDrive,
    omniroute: Waypoints,
    custom: SlidersHorizontal,
  });

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

  const provider = $derived(PROVIDERS.find((p) => p.id === formProvider) ?? PROVIDERS[0]);
  const modelPresets = $derived(PROVIDER_MODELS[formProvider] ?? []);
  const isOllama = $derived(formProvider === "ollama");
  const isOmniroute = $derived(formProvider === "omniroute");
  /** Our own free gateway: authenticated by device id, so there is no key to enter. */
  const isStroke = $derived(formProvider === "stroke");
  const isCustom = $derived(formProvider === "custom");
  const isCopilot = $derived(formProvider === "copilot");
  const needsKey = $derived(!formApiKey && !isOllama && !isCustom && !isCopilot && !isStroke);

  /** Models discovered from a local OpenAI-compatible server (Ollama, LM Studio). */
  let localModels = $state(/** @type {string[]} */ ([]));
  let localModelsLoading = $state(false);
  let localModelsError = $state("");

  const isLocalEndpoint = $derived(
    isOllama || isOmniroute || (isCustom && /localhost|127\.0\.0\.1/.test(formBaseUrl)),
  );

  function resetLocalModels() {
    localModels = [];
    localModelsLoading = false;
    localModelsError = "";
  }

  /**
   * Ask the local server which models it actually has. Ollama rejects anything but
   * an exact installed tag, so the list has to come from the server, not a preset.
   */
  async function loadLocalModels() {
    localModelsLoading = true;
    localModelsError = "";
    try {
      const ids = await fetchModelIds(formBaseUrl || (provider?.url ?? ""), formApiKey);
      localModels = ids;
      if (ids.length === 0) {
        localModelsError = isOllama
          ? "No models installed. Pull one first — e.g. `ollama pull llama3.1:8b`."
          : isOmniroute
            ? "No models available. Connect a provider in the OmniRoute dashboard first."
            : "The server reported no models.";
      } else if (!ids.includes(formModel)) {
        formModel = ids[0];
      }
    } catch (e) {
      localModels = [];
      localModelsError = String(/** @type {any} */ (e)?.message ?? e).slice(0, 200);
    } finally {
      localModelsLoading = false;
    }
  }

  /** Discover local models when entering step 1; retry is manual after that. */
  $effect(() => {
    if (isLocalEndpoint && step === 1 && localModels.length === 0 && !localModelsLoading && !localModelsError) {
      void loadLocalModels();
    }
  });

  /** Dynamic models fetched from Copilot API after login */
  let copilotModels = $state(/** @type {{id:string,name:string}[]} */ ([]));
  let copilotModelsLoading = $state(false);

  /** Called when CopilotLogin completes with a fresh model list */
  function onCopilotConnect(models) {
    copilotModels = models;
    if (models.length > 0 && !formModel) formModel = models[0].id;
    testState = "ok";
    testMsg = "Connected to GitHub Copilot";
  }

  /** Load dynamic Copilot models when entering step 1 for the Copilot provider */
  $effect(() => {
    if (isCopilot && step === 1 && copilotModels.length === 0 && !copilotModelsLoading) {
      copilotModelsLoading = true;
      fetchCopilotModels()
        .then((m) => { copilotModels = m; if (!formModel && m.length > 0) formModel = m[0].id; })
        .catch(() => { /* fallback to static presets */ })
        .finally(() => { copilotModelsLoading = false; });
    }
  });

  const stepCanProceed = $derived(
    step === 0 ? !!formProvider : !!formModel.trim()
  );

  function resetForm(pid = "openrouter") {
    formProvider = pid;
    const p = PROVIDERS.find((x) => x.id === pid) ?? PROVIDERS[0];
    formBaseUrl = p.url;
    formModel = (PROVIDER_MODELS[pid] ?? [])[0]?.model ?? "";
    formName = "";
    formApiKey = "";
    showKey = false;
    showAdvanced = false;
    testState = "idle";
    testMsg = "";
    step = 0;
    resetLocalModels();
  }

  function handleOpenChange(/** @type {boolean} */ next) {
    if (next) { view = "list"; editingId = null; resetForm(); }
  }

  function startAdd() { editingId = null; resetForm(); view = "form"; }

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
    step = 0;
    resetLocalModels();
    try { formApiKey = await invoke("ai_load_key", { profileId: profile.id }); }
    catch { formApiKey = ""; }
    view = "form";
  }

  /** @param {string} pid */
  function selectProvider(pid) {
    formProvider = pid;
    const p = PROVIDERS.find((x) => x.id === pid) ?? PROVIDERS[0];
    formBaseUrl = p.url;
    const presets = PROVIDER_MODELS[pid] ?? [];
    formModel = presets[0]?.model ?? "";
    testState = "idle";
    resetLocalModels();
  }

  function nextStep() { if (step < STEPS.length - 1) step++; }
  function prevStep() { if (step > 0) step--; else { view = "list"; editingId = null; } }

  async function save() {
    if (!formModel.trim()) return;
    saving = true;
    try {
      const id = editingId ?? crypto.randomUUID();
      const name = formName.trim() || modelShortName(formModel);
      await saveProfile({ id, name, provider: formProvider, baseUrl: formBaseUrl.trim() || (provider?.url ?? ""), model: formModel.trim() }, formApiKey);
      await setActiveProfile(id);
      view = "list";
    } finally { saving = false; }
  }

  /** @param {string | null} id */
  async function handleDelete(id) {
    if (!id) return;
    await deleteProfile(id);
    if (editingId === id) view = "list";
  }

  async function testConnection() {
    if (testState === "testing") return;
    testState = "testing"; testMsg = "";
    try {
      const res = await chatCompletionRaw(
        { baseUrl: formBaseUrl || (provider?.url ?? ""), apiKey: formApiKey, model: formModel },
        [{ role: "user", content: "Reply with the single word: ok" }], null,
      );
      if (res.content == null) throw new Error("Empty response");
      testState = "ok"; testMsg = `Connected · ${formModel}`;
    } catch (e) { testState = "error"; testMsg = String(/** @type {any} */ (e)?.message ?? e).slice(0, 200); }
  }

  /** @param {string} model */
  function modelShortName(model) { return model.split("/").pop()?.split(":")[0] ?? model; }
</script>

<!-- Selected mark: a filled badge reads as a deliberate state, where a bare tick
     floating in the row read as decoration. -->
{#snippet checkBadge()}
  <span class="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
    <Check class="size-2.5" strokeWidth={3.5} />
  </span>
{/snippet}

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content showCloseButton={false} class="w-[min(580px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

    <!-- ══ LIST VIEW ═════════════════════════════════════════════════════ -->
    {#if view === "list"}
      <div class="flex items-center gap-2 border-b border-border/25 px-5 py-4">
        <div class="flex-1">
          <Dialog.Title class="text-ui-sm font-semibold text-foreground">AI Models</Dialog.Title>
          <Dialog.Description class="mt-0.5 text-ui-2xs text-muted-foreground/60">
            Select an active model or add a new one.
          </Dialog.Description>
        </div>
        <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
      </div>

      <div class="app-scroll max-h-[min(60vh,30rem)] overflow-y-auto px-3 py-2">
        {#if $aiProfiles.length === 0}
          <p class="py-6 text-center text-ui-xs text-muted-foreground/50">No models configured.</p>
        {:else}
          <div class="flex flex-col gap-px">
            {#each $aiProfiles as profile (profile.id)}
              {@const isActive = profile.id === $activeProfileId}
              <div
                class={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                  isActive ? "bg-muted/50" : "hover:bg-muted/30",
                )}
                role="button"
                tabindex="0"
                onclick={() => void setActiveProfile(profile.id)}
                onkeydown={(e) => e.key === "Enter" && void setActiveProfile(profile.id)}
              >
                {#if hasBrand(profile.provider)}
                  <BrandIcon
                    name={profile.provider}
                    class={cn("size-4 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")}
                  />
                {:else}
                  {@const Fallback = PROVIDER_ICON_FALLBACK[profile.provider] ?? Sparkles}
                  <Fallback class="size-4 shrink-0 text-muted-foreground/70" />
                {/if}
                <div class="min-w-0 flex-1">
                  <p class="truncate text-ui-sm font-medium text-foreground">{profile.name}</p>
                  <p class="mt-0.5 truncate font-mono text-ui-3xs text-muted-foreground/50">{profile.model}</p>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  {#if isActive}
                    <span class="rounded-md bg-muted/60 px-1.5 py-0.5 text-ui-3xs font-semibold uppercase tracking-wider text-muted-foreground/50">active</span>
                  {/if}
                  <button
                    class="rounded-md px-2 py-0.5 text-ui-2xs text-muted-foreground/40 opacity-0 transition-colors hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
                    onclick={(e) => { e.stopPropagation(); void startEdit(profile) }}
                  >Edit</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="border-t border-border/25 px-4 py-3">
        <button type="button"
          class="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/25 bg-muted/[0.2] py-2 text-ui-xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={startAdd}>
          <Plus class="size-3.5" />
          Add model
        </button>
      </div>

    <!-- ══ FORM VIEW ═════════════════════════════════════════════════════ -->
    {:else}
      <!-- Header -->
      <div class="border-b border-border/25 px-4 py-3.5">
        <div class="flex items-center gap-2">
          <button type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
            onclick={prevStep}
            title={step === 0 ? "Cancel" : "Back"}
          >
            <ChevronLeft class="size-3.5" />
          </button>
          <Dialog.Title class="flex-1 text-center text-ui-sm font-semibold text-foreground">
            {editingId ? "Edit model" : "Add model"}
          </Dialog.Title>
          <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
        </div>

        <!-- Progress. Numbered bubbles joined by connector lines are a lot of
             chrome for three steps; a named step plus a segmented rail says the
             same thing in one line and never wraps. -->
        <div class="mt-3 flex items-center gap-2">
          <span class="text-ui-xs font-medium text-foreground">{STEPS[step]}</span>
          <span class="text-ui-2xs tabular-nums text-muted-foreground/50"
            >{step + 1}/{STEPS.length}</span
          >
          <div class="ml-auto flex items-center gap-1" aria-hidden="true">
            {#each STEPS as _, i}
              <span
                class={cn(
                  "h-0.5 w-5 rounded-full transition-colors",
                  i <= step ? "bg-primary" : "bg-border",
                )}
              ></span>
            {/each}
          </div>
        </div>
      </div>

      <!-- Step body -->
      <div class="app-scroll max-h-[min(60vh,34rem)] overflow-y-auto px-4 py-3">

        <!-- Step 0 · Provider ─────────────────────────────────────────── -->
        {#if step === 0}
          <!-- Every row carries a mark: providers are recognised by their logo
               long before the name is read, and a grid of bare labels was the
               least identifiable version of this list. -->
          <div class="grid grid-cols-2 gap-1.5">
            {#each PROVIDERS as p (p.id)}
              {@const selected = formProvider === p.id}
              {@const Fallback = PROVIDER_ICON_FALLBACK[p.id] ?? Sparkles}
              <button
                type="button"
                class={cn(CARD_BASE, "h-9 px-2.5", selected ? CARD_SELECTED : CARD_IDLE)}
                onclick={() => selectProvider(p.id)}
              >
                {#if hasBrand(p.id)}
                  <BrandIcon name={p.id} class={cn("size-4 shrink-0", !selected && "opacity-70")} />
                {:else}
                  <Fallback class={cn("size-4 shrink-0", !selected && "opacity-60")} />
                {/if}
                <span class="min-w-0 flex-1 truncate text-ui-sm font-medium">{p.label}</span>
                {#if selected}{@render checkBadge()}{/if}
              </button>
            {/each}
          </div>

        <!-- Step 1 · Model ────────────────────────────────────────────── -->
        {:else if step === 1}
          {#if isCopilot}
            <!-- Copilot: show dynamic models fetched from the API -->
            {#if copilotModelsLoading}
              <div class="flex items-center justify-center gap-2 py-4 text-ui-xs text-muted-foreground">
                <Loader2 class="size-3.5 animate-spin" />Fetching available models…
              </div>
            {:else}
              {@const list = copilotModels.length > 0 ? copilotModels.map(m => ({ label: m.name, model: m.id, tag: '' })) : modelPresets}
              <div class="grid grid-cols-2 gap-1.5">
                {#each list as preset (preset.model)}
                  {@const selected = formModel === preset.model}
                  <button
                    type="button"
                    class={cn(CARD_BASE, "px-3 py-2", selected ? CARD_SELECTED : CARD_IDLE)}
                    onclick={() => { formModel = preset.model; testState = "idle"; }}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="text-ui-sm font-medium text-foreground">{preset.label}</p>
                      {#if preset.tag}<p class="mt-0.5 font-mono text-ui-3xs text-muted-foreground/50">{preset.tag}</p>{/if}
                    </div>
                    {#if selected}{@render checkBadge()}{/if}
                  </button>
                {/each}
              </div>
            {/if}
          {:else if isLocalEndpoint}
            <!-- Local server: list what is actually installed, never a guessed tag -->
            {#if localModelsLoading}
              <div class="flex items-center justify-center gap-2 py-4 text-ui-xs text-muted-foreground">
                <Loader2 class="size-3.5 animate-spin" />Looking for installed models…
              </div>
            {:else if localModels.length > 0}
              <div class="grid grid-cols-2 gap-1.5">
                {#each localModels as id (id)}
                  {@const selected = formModel === id}
                  <button
                    type="button"
                    class={cn(CARD_BASE, "px-3 py-2", selected ? CARD_SELECTED : CARD_IDLE)}
                    onclick={() => { formModel = id; testState = "idle"; }}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-mono text-ui-xs text-foreground">{id}</p>
                    </div>
                    {#if selected}{@render checkBadge()}{/if}
                  </button>
                {/each}
              </div>
            {/if}

            {#if localModelsError}
              <div class="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.08] px-3 py-2.5">
                <p class="flex items-start gap-2 text-ui-xs text-destructive">
                  <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span class="break-words">{localModelsError}</span>
                </p>
                {#if isOllama}
                  <p class="text-ui-3xs text-muted-foreground">
                    Ollama must be running — start it with <code class="font-mono">ollama serve</code>.
                  </p>
                {:else if isOmniroute}
                  <p class="text-ui-3xs text-muted-foreground">
                    The gateway runs on your machine — install it with
                    <code class="font-mono">npm i -g omniroute</code>, then run
                    <code class="font-mono">omniroute</code>.
                  </p>
                {/if}
                <Input
                  class="h-8 font-mono text-ui-xs"
                  placeholder={provider?.url ?? ""}
                  bind:value={formBaseUrl}
                />
              </div>
            {/if}

            {#if !localModelsLoading}
              <button
                type="button"
                class="mt-2 flex items-center gap-1.5 self-start text-ui-xs text-muted-foreground hover:text-foreground"
                onclick={() => void loadLocalModels()}
              >
                <RefreshCw class="size-3 shrink-0" />
                {localModels.length > 0 ? `${localModels.length} installed · refresh` : "Retry"}
              </button>
            {/if}

          {:else if modelPresets.length > 0}
            <div class="grid grid-cols-2 gap-1.5">
              {#each modelPresets as preset (preset.model)}
                {@const selected = formModel === preset.model}
                <button
                  type="button"
                  class={cn(CARD_BASE, "px-3 py-2", selected ? CARD_SELECTED : CARD_IDLE)}
                  onclick={() => { formModel = preset.model; testState = "idle"; }}
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-ui-sm font-medium text-foreground">{preset.label}</p>
                    {#if preset.tag}<p class="mt-0.5 font-mono text-ui-3xs text-muted-foreground/50">{preset.tag}</p>{/if}
                  </div>
                  {#if selected}{@render checkBadge()}{/if}
                </button>
              {/each}
            </div>
          {/if}

          <div class="mt-3 flex flex-col gap-1.5">
            <label for="form-model" class="text-ui-xs font-medium text-foreground">
              Model ID
              {#if modelPresets.length > 0}
                <span class="font-normal text-muted-foreground">(editable)</span>
              {/if}
            </label>
            <Input
              id="form-model"
              class="h-8 font-mono text-ui-xs"
              placeholder={isOmniroute ? "auto" : isLocalEndpoint ? "llama3.1:8b" : "provider/model-name"}
              bind:value={formModel}
            />
          </div>

        <!-- Step 2 · Credentials ──────────────────────────────────────── -->
        {:else}
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="form-name" class="text-ui-xs font-medium text-foreground">Display name</label>
              <Input id="form-name" class="h-8 text-ui-sm" placeholder={formModel ? modelShortName(formModel) : "My model"} bind:value={formName} />
            </div>

            {#if isCopilot}
              <!-- GitHub Copilot: OAuth device flow instead of API key -->
              <CopilotLogin onconnect={onCopilotConnect} ondisconnect={() => { testState = "idle"; testMsg = "" }} />
            {:else if isStroke}
              <p class="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-ui-xs text-muted-foreground">
                No key needed — this is Stroke's own free tier, with a daily limit
                per device. Add your own provider any time for unlimited use.
              </p>
            {:else if !isOllama}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline gap-1.5">
                  <label for="form-key" class="text-ui-xs font-medium text-foreground">API key</label>
                  <span class="text-ui-3xs text-muted-foreground">stored securely</span>
                </div>
                <div class="relative">
                  <Input
                    id="form-key"
                    class="h-8 pr-8 font-mono text-ui-xs"
                    type={showKey ? "text" : "password"}
                    placeholder="sk-…"
                    bind:value={formApiKey}
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                    onclick={() => (showKey = !showKey)}
                    tabindex="-1"
                  >
                    {#if showKey}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
                  </button>
                </div>
                {#if needsKey}
                  <p class="flex items-center gap-1.5 text-ui-xs text-muted-foreground">
                    <AlertTriangle class="size-3 shrink-0" />
                    Required for {provider?.label}.
                    {#if provider?.keysUrl}
                      <button type="button" class="underline underline-offset-2" onclick={() => openExternal(provider.keysUrl)}>
                        Get one →
                      </button>
                    {/if}
                  </p>
                {/if}
              </div>
            {/if}

            {#if isCustom || modelPresets.length === 0}
              <div class="flex flex-col gap-1.5">
                <label for="form-endpoint" class="text-ui-xs font-medium text-foreground">Endpoint URL</label>
                <Input id="form-endpoint" class="h-8 font-mono text-ui-xs" placeholder="https://…/v1" bind:value={formBaseUrl} />
              </div>
            {:else if !isOllama}
              <button
                type="button"
                class="flex items-center gap-1 self-start text-ui-xs text-muted-foreground hover:text-foreground"
                onclick={() => (showAdvanced = !showAdvanced)}
              >
                <ChevronRight class={cn("size-3.5 transition-transform", showAdvanced && "rotate-90")} />
                Custom endpoint
              </button>
              {#if showAdvanced}
                <Input class="h-8 font-mono text-ui-xs" placeholder={provider?.url ?? ""} bind:value={formBaseUrl} />
              {/if}
            {/if}

            {#if testState === "ok"}
              <div class="flex items-center gap-2 rounded-lg border border-success/20 bg-success/[0.08] px-3 py-2.5 text-ui-xs text-success">
                <Check class="size-3.5 shrink-0" />{testMsg}
              </div>
            {:else if testState === "error"}
              <div class="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.08] px-3 py-2.5 text-ui-xs text-destructive">
                <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span class="break-words">{testMsg}</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between gap-2 border-t border-border/25 px-4 py-3">
        <div class="flex items-center gap-1.5">
          {#if step === 2}
            <button type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/25 px-3 text-ui-xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
              disabled={testState === "testing" || !formModel.trim()}
              onclick={testConnection}>
              {#if testState === "testing"}<Loader2 class="size-3 animate-spin" />Testing…{:else}Test{/if}
            </button>
          {/if}
          {#if editingId}
            <button type="button"
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:bg-muted/40 hover:text-destructive"
              onclick={() => void handleDelete(editingId)}>
              <Trash2 class="size-3.5" />
            </button>
          {/if}
        </div>

        {#if step < STEPS.length - 1}
          <button type="button"
            class="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-ui-xs font-medium text-primary-foreground elevate-1 transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            disabled={!stepCanProceed}
            onclick={nextStep}>
            Continue <ChevronRight class="size-3" />
          </button>
        {:else}
          <button type="button"
            class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-xs font-medium text-primary-foreground elevate-1 transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            disabled={saving || !formModel.trim()}
            onclick={() => void save()}>
            {#if saving}<Loader2 class="size-3 animate-spin" />{/if}
            {editingId ? "Save" : "Add model"}
          </button>
        {/if}
      </div>
    {/if}

  </Dialog.Content>
</Dialog.Root>
