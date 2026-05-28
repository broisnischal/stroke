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
  const needsKey = $derived(!formApiKey && !isOllama && !isCustom);

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
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[22rem]">

    <!-- ══ LIST VIEW ═════════════════════════════════════════════════════ -->
    {#if view === "list"}
      <Dialog.Header class="space-y-0.5 border-b border-border/60 px-5 py-4">
        <Dialog.Title class="text-sm font-semibold tracking-tight">AI Models</Dialog.Title>
        <Dialog.Description class="text-xs text-muted-foreground">
          Select an active model or add a new one.
        </Dialog.Description>
      </Dialog.Header>

      <div class="app-scroll max-h-[min(60vh,30rem)] overflow-y-auto px-4 py-3">
        {#if $aiProfiles.length === 0}
          <p class="py-6 text-center text-sm text-muted-foreground">No models configured.</p>
        {:else}
          <div class="divide-y divide-border/60 rounded-lg border border-border/80">
            {#each $aiProfiles as profile (profile.id)}
              {@const isActive = profile.id === $activeProfileId}
              <div
                class={cn(
                  "group flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer first:rounded-t-lg last:rounded-b-lg",
                  isActive ? "bg-muted/60" : "hover:bg-muted/40",
                )}
                role="button"
                tabindex="0"
                onclick={() => void setActiveProfile(profile.id)}
                onkeydown={(e) => e.key === "Enter" && void setActiveProfile(profile.id)}
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-foreground">{profile.name}</p>
                  <p class="truncate font-mono text-xs text-muted-foreground">{profile.model}</p>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  {#if isActive}
                    <Badge variant="secondary" class="text-[10px]">Active</Badge>
                  {/if}
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 text-xs opacity-0 group-hover:opacity-100"
                    onclick={(e) => { e.stopPropagation(); void startEdit(profile) }}
                  >Edit</Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="border-t border-border/60 px-4 py-3">
        <Button variant="outline" class="w-full gap-2 text-sm" onclick={startAdd}>
          <Plus class="size-3.5" />
          Add model
        </Button>
      </div>

    <!-- ══ FORM VIEW ═════════════════════════════════════════════════════ -->
    {:else}
      <!-- Header -->
      <Dialog.Header class="border-b border-border/60 px-4 py-3">
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onclick={prevStep} title={step === 0 ? "Cancel" : "Back"}>
            <ChevronLeft class="size-4" />
          </Button>
          <Dialog.Title class="flex-1 text-center text-sm font-semibold tracking-tight">
            {editingId ? "Edit model" : "Add model"}
          </Dialog.Title>
          <span class="size-7 shrink-0"></span>
        </div>

        <!-- Step indicator -->
        <div class="mt-3 flex items-center justify-center gap-1">
          {#each STEPS as label, i}
            <div class="flex items-center gap-1">
              <span class={cn(
                "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 transition-all",
                i < step  ? "bg-foreground text-background ring-foreground"
                : i === step ? "bg-background text-foreground ring-foreground"
                : "bg-transparent text-muted-foreground/50 ring-border/50",
              )}>
                {#if i < step}<Check class="size-2.5" />{:else}{i + 1}{/if}
              </span>
              <span class={cn("text-[11px] font-medium", i === step ? "text-foreground" : "text-muted-foreground/40")}>
                {label}
              </span>
            </div>
            {#if i < STEPS.length - 1}
              <div class={cn("h-px w-5 shrink-0 transition-colors", i < step ? "bg-foreground/30" : "bg-border/50")}></div>
            {/if}
          {/each}
        </div>
      </Dialog.Header>

      <!-- Step body -->
      <div class="app-scroll max-h-[min(60vh,34rem)] overflow-y-auto px-4 py-3">

        <!-- Step 0 · Provider ─────────────────────────────────────────── -->
        {#if step === 0}
          <div class="divide-y divide-border/60 rounded-lg border border-border/80">
            {#each PROVIDERS as p (p.id)}
              {@const selected = formProvider === p.id}
              <button
                type="button"
                class={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-lg last:rounded-b-lg",
                  selected ? "bg-muted/60" : "hover:bg-muted/40",
                )}
                onclick={() => selectProvider(p.id)}
              >
                <span class="text-sm font-medium text-foreground">{p.label}</span>
                {#if selected}<Check class="size-3.5 shrink-0 text-foreground" />{/if}
              </button>
            {/each}
          </div>

        <!-- Step 1 · Model ────────────────────────────────────────────── -->
        {:else if step === 1}
          {#if modelPresets.length > 0}
            <div class="divide-y divide-border/60 rounded-lg border border-border/80">
              {#each modelPresets as preset (preset.model)}
                {@const selected = formModel === preset.model}
                <button
                  type="button"
                  class={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-lg last:rounded-b-lg",
                    selected ? "bg-muted/60" : "hover:bg-muted/40",
                  )}
                  onclick={() => { formModel = preset.model; testState = "idle"; }}
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">{preset.label}</p>
                    <p class="font-mono text-xs text-muted-foreground">{preset.tag}</p>
                  </div>
                  {#if selected}<Check class="size-3.5 shrink-0 text-foreground" />{/if}
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

            {#if !isOllama}
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
              <div class="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-xs text-foreground">
                <Check class="size-3.5 shrink-0" />{testMsg}
              </div>
            {:else if testState === "error"}
              <div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
                <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span class="break-words">{testMsg}</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
        <div class="flex items-center gap-1.5">
          {#if step === 2}
            <Button variant="outline" size="sm" disabled={testState === "testing" || !formModel.trim()} onclick={testConnection}>
              {#if testState === "testing"}<Loader2 class="size-3.5 animate-spin" />Testing…{:else}Test{/if}
            </Button>
          {/if}
          {#if editingId}
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-destructive" onclick={() => void handleDelete(editingId)}>
              <Trash2 class="size-3.5" />
            </Button>
          {/if}
        </div>

        {#if step < STEPS.length - 1}
          <Button size="sm" disabled={!stepCanProceed} onclick={nextStep}>
            Continue <ChevronRight class="size-3.5" />
          </Button>
        {:else}
          <Button size="sm" disabled={saving || !formModel.trim()} onclick={() => void save()}>
            {#if saving}<Loader2 class="size-3.5 animate-spin" />{/if}
            {editingId ? "Save" : "Add model"}
          </Button>
        {/if}
      </div>
    {/if}

  </Dialog.Content>
</Dialog.Root>
