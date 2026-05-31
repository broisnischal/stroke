<script>
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { cn } from "$lib/utils.js";
  import { chatCompletionRaw } from "$lib/ai.js";
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
  const isCustom = $derived(formProvider === "custom");
  const isCopilot = $derived(formProvider === "copilot");
  const needsKey = $derived(!formApiKey && !isOllama && !isCustom && !isCopilot);

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
    if (presets.length > 0) formModel = presets[0].model;
    testState = "idle";
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

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content showCloseButton={false} class="w-[min(380px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

    <!-- ══ LIST VIEW ═════════════════════════════════════════════════════ -->
    {#if view === "list"}
      <div class="flex items-center gap-2 border-b border-border/25 px-5 py-4">
        <div class="flex-1">
          <Dialog.Title class="text-[13px] font-semibold text-foreground">AI Models</Dialog.Title>
          <Dialog.Description class="mt-0.5 text-[11px] text-muted-foreground/60">
            Select an active model or add a new one.
          </Dialog.Description>
        </div>
        <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
      </div>

      <div class="app-scroll max-h-[min(60vh,30rem)] overflow-y-auto px-3 py-2">
        {#if $aiProfiles.length === 0}
          <p class="py-6 text-center text-[12px] text-muted-foreground/50">No models configured.</p>
        {:else}
          <div class="flex flex-col gap-px">
            {#each $aiProfiles as profile (profile.id)}
              {@const isActive = profile.id === $activeProfileId}
              <div
                class={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  isActive ? "bg-muted/50" : "hover:bg-muted/30",
                )}
                role="button"
                tabindex="0"
                onclick={() => void setActiveProfile(profile.id)}
                onkeydown={(e) => e.key === "Enter" && void setActiveProfile(profile.id)}
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] font-medium text-foreground">{profile.name}</p>
                  <p class="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">{profile.model}</p>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  {#if isActive}
                    <span class="rounded-md bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">active</span>
                  {/if}
                  <button
                    class="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/40 opacity-0 transition-colors hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
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
          class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/25 bg-muted/[0.2] py-2 text-[12px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
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
            class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
            onclick={prevStep}
            title={step === 0 ? "Cancel" : "Back"}
          >
            <ChevronLeft class="size-3.5" />
          </button>
          <Dialog.Title class="flex-1 text-center text-[13px] font-semibold text-foreground">
            {editingId ? "Edit model" : "Add model"}
          </Dialog.Title>
          <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
        </div>

        <!-- Stepper -->
        <div class="mt-3.5 flex items-center justify-center gap-1.5">
          {#each STEPS as label, i}
            <div class="flex items-center gap-1.5">
              <span class={cn(
                "flex size-[18px] items-center justify-center rounded-full text-[9px] font-semibold transition-all",
                i < step  ? "bg-foreground text-background"
                : i === step ? "bg-transparent text-foreground ring-1 ring-foreground/60"
                : "bg-transparent text-muted-foreground/35 ring-1 ring-border/40",
              )}>
                {#if i < step}<Check class="size-2" />{:else}{i + 1}{/if}
              </span>
              <span class={cn("text-[10px] font-medium", i === step ? "text-foreground" : "text-muted-foreground/35")}>
                {label}
              </span>
            </div>
            {#if i < STEPS.length - 1}
              <div class={cn("h-px w-4 shrink-0 rounded-full transition-colors", i < step ? "bg-foreground/25" : "bg-border/30")}></div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- Step body -->
      <div class="app-scroll max-h-[min(60vh,34rem)] overflow-y-auto px-4 py-3">

        <!-- Step 0 · Provider ─────────────────────────────────────────── -->
        {#if step === 0}
          <div class="flex flex-col gap-px">
            {#each PROVIDERS as p (p.id)}
              {@const selected = formProvider === p.id}
              <button
                type="button"
                class={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  selected ? "bg-muted/50" : "hover:bg-muted/30",
                )}
                onclick={() => selectProvider(p.id)}
              >
                <span class="text-[13px] font-medium text-foreground">{p.label}</span>
                {#if selected}<Check class="size-3 shrink-0 text-foreground/70" />{/if}
              </button>
            {/each}
          </div>

        <!-- Step 1 · Model ────────────────────────────────────────────── -->
        {:else if step === 1}
          {#if isCopilot}
            <!-- Copilot: show dynamic models fetched from the API -->
            {#if copilotModelsLoading}
              <div class="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 class="size-3.5 animate-spin" />Fetching available models…
              </div>
            {:else}
              {@const list = copilotModels.length > 0 ? copilotModels.map(m => ({ label: m.name, model: m.id, tag: '' })) : modelPresets}
              <div class="flex flex-col gap-px">
                {#each list as preset (preset.model)}
                  {@const selected = formModel === preset.model}
                  <button
                    type="button"
                    class={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-muted/50" : "hover:bg-muted/30",
                    )}
                    onclick={() => { formModel = preset.model; testState = "idle"; }}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-medium text-foreground">{preset.label}</p>
                      {#if preset.tag}<p class="mt-0.5 font-mono text-[10px] text-muted-foreground/50">{preset.tag}</p>{/if}
                    </div>
                    {#if selected}<Check class="size-3 shrink-0 text-foreground/70" />{/if}
                  </button>
                {/each}
              </div>
            {/if}
          {:else if modelPresets.length > 0}
            <div class="flex flex-col gap-px">
              {#each modelPresets as preset (preset.model)}
                {@const selected = formModel === preset.model}
                <button
                  type="button"
                  class={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    selected ? "bg-muted/50" : "hover:bg-muted/30",
                  )}
                  onclick={() => { formModel = preset.model; testState = "idle"; }}
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-medium text-foreground">{preset.label}</p>
                    {#if preset.tag}<p class="mt-0.5 font-mono text-[10px] text-muted-foreground/50">{preset.tag}</p>{/if}
                  </div>
                  {#if selected}<Check class="size-3 shrink-0 text-foreground/70" />{/if}
                </button>
              {/each}
            </div>
          {/if}

          <div class="mt-3 flex flex-col gap-1.5">
            <label for="form-model" class="text-xs font-medium text-foreground">
              Model ID
              {#if modelPresets.length > 0}
                <span class="font-normal text-muted-foreground">(editable)</span>
              {/if}
            </label>
            <Input id="form-model" class="h-8 font-mono text-xs" placeholder="provider/model-name" bind:value={formModel} />
          </div>

        <!-- Step 2 · Credentials ──────────────────────────────────────── -->
        {:else}
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="form-name" class="text-xs font-medium text-foreground">Display name</label>
              <Input id="form-name" class="h-8 text-sm" placeholder={formModel ? modelShortName(formModel) : "My model"} bind:value={formName} />
            </div>

            {#if isCopilot}
              <!-- GitHub Copilot: OAuth device flow instead of API key -->
              <CopilotLogin onconnect={onCopilotConnect} ondisconnect={() => { testState = "idle"; testMsg = "" }} />
            {:else if !isOllama}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline gap-1.5">
                  <label for="form-key" class="text-xs font-medium text-foreground">API key</label>
                  <span class="text-[10px] text-muted-foreground">stored securely</span>
                </div>
                <div class="relative">
                  <Input
                    id="form-key"
                    class="h-8 pr-8 font-mono text-xs"
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
                  <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                <label for="form-endpoint" class="text-xs font-medium text-foreground">Endpoint URL</label>
                <Input id="form-endpoint" class="h-8 font-mono text-xs" placeholder="https://…/v1" bind:value={formBaseUrl} />
              </div>
            {:else if !isOllama}
              <button
                type="button"
                class="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
                onclick={() => (showAdvanced = !showAdvanced)}
              >
                <ChevronRight class={cn("size-3.5 transition-transform", showAdvanced && "rotate-90")} />
                Custom endpoint
              </button>
              {#if showAdvanced}
                <Input class="h-8 font-mono text-xs" placeholder={provider?.url ?? ""} bind:value={formBaseUrl} />
              {/if}
            {/if}

            {#if testState === "ok"}
              <div class="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-2.5 text-[12px] text-emerald-500">
                <Check class="size-3.5 shrink-0" />{testMsg}
              </div>
            {:else if testState === "error"}
              <div class="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.08] px-3 py-2.5 text-[12px] text-destructive">
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
              class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/25 px-3 text-[12px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
              disabled={testState === "testing" || !formModel.trim()}
              onclick={testConnection}>
              {#if testState === "testing"}<Loader2 class="size-3 animate-spin" />Testing…{:else}Test{/if}
            </button>
          {/if}
          {#if editingId}
            <button type="button"
              class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/40 hover:text-destructive"
              onclick={() => void handleDelete(editingId)}>
              <Trash2 class="size-3.5" />
            </button>
          {/if}
        </div>

        {#if step < STEPS.length - 1}
          <button type="button"
            class="inline-flex h-7 items-center gap-1 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
            disabled={!stepCanProceed}
            onclick={nextStep}>
            Continue <ChevronRight class="size-3" />
          </button>
        {:else}
          <button type="button"
            class="inline-flex h-7 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
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
