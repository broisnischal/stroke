<script>
  /**
   * The app's one alert dialog: "are you sure?" with a single confirm action.
   *
   * Every such dialog used to hand-roll its own width, padding and footer, so
   * they came out different sizes and their buttons sat at different insets.
   * One component means one geometry - change it here and every prompt in the
   * app moves together.
   */
  import Icon from './Icon.svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { cn } from '$lib/utils.js'

  let {
    open = $bindable(false),
    /** Icon in the leading badge - an icon-registry name. */
    icon = 'alert-circle',
    title = '',
    /** Main question. Use the `body` snippet instead when it needs markup. */
    description = '',
    /** Consequence spelled out under the question, muted. */
    note = '',
    confirmLabel = 'Confirm',
    /** Icon on the confirm button; '' hides it. */
    confirmIcon = 'check',
    cancelLabel = 'Cancel',
    /** 'destructive' paints the confirm button red. */
    variant = /** @type {'default' | 'destructive'} */ ('default'),
    disabled = false,
    /**
     * Enter presses the confirm button, and nothing is focused when the dialog
     * opens so that it can. Opt in only where confirming by accident is cheap to
     * undo - it is off by default so a stray Return can never drop a table.
     */
    confirmOnEnter = false,
    onconfirm = () => {},
    oncancel = () => {},
    /** Optional rich body, rendered in place of `description`. */
    body = undefined,
    /** Optional full-width block below the header - toggles, SQL previews.
     *  Separated by a hairline so it reads as its own section. */
    extra = undefined,
  } = $props()

  function confirm() {
    if (disabled) return
    open = false
    onconfirm()
  }
  function cancel() {
    open = false
    oncancel()
  }

  /** @type {HTMLElement|null} */
  let contentEl = $state(null)

  /**
   * Hold focus on the dialog itself instead of letting it land on Cancel, which
   * is the first focusable child. With Cancel focused, Enter would click it -
   * the exact opposite of the confirm-on-Enter below. Tab still reaches both
   * buttons, and Escape still cancels.
   * @param {Event} e
   */
  function onOpenAutoFocus(e) {
    if (!confirmOnEnter) return
    e.preventDefault()
    try { contentEl?.focus({ preventScroll: true }) } catch { /* not focusable */ }
  }

  /**
   * Enter confirms - the default-button behaviour every native alert dialog has,
   * so a prompt can be answered without reaching for the mouse.
   *
   * Skipped wherever Enter already means something else: on a focused button the
   * browser clicks it (confirming here too would fire Cancel *and* confirm), and
   * in a textarea or contenteditable it inserts a newline. A plain input is left
   * alone deliberately - Enter submitting a one-line field is what people expect.
   * @param {KeyboardEvent} e
   */
  function onkeydown(e) {
    if (!confirmOnEnter) return
    if (e.key !== 'Enter' || e.isComposing) return
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    const el = e.target
    if (el instanceof HTMLElement && (el.closest('button, a[href], select, textarea') || el.isContentEditable)) return
    if (disabled) return
    e.preventDefault()
    confirm()
  }
</script>

<Dialog.Root bind:open>
  <!-- 440px: wide enough that a database or table name stays on one line, which
       is what made the old 380px prompts wrap mid-sentence. -->
  <Dialog.Content
    bind:ref={contentEl}
    tabindex={-1}
    showCloseButton={false}
    {onkeydown}
    {onOpenAutoFocus}
    class="w-[min(440px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0"
  >
    <div class="flex items-start gap-3.5 px-5 pt-5 pb-4">
      <div class="mt-px shrink-0 rounded-lg bg-muted/50 p-2">
        <Icon
          name={icon}
          class={cn('size-3.5', variant === 'destructive' ? 'text-destructive/80' : 'text-muted-foreground/70')}
        />
      </div>
      <div class="min-w-0 flex-1">
        <Dialog.Title class="text-ui-sm font-semibold text-foreground">{title}</Dialog.Title>
        {#if body}
          <div class="mt-0.5 text-ui-xs leading-[1.5] text-muted-foreground/70">{@render body()}</div>
        {:else if description}
          <p class="mt-0.5 text-ui-xs leading-[1.5] text-muted-foreground/70">{description}</p>
        {/if}
        {#if note}
          <p class="mt-2 text-ui-xs leading-[1.5] text-muted-foreground/55">{note}</p>
        {/if}
      </div>
    </div>

    {#if extra}
      <div class="border-t border-border/25">{@render extra()}</div>
    {/if}

    <div class="flex items-center justify-end gap-2 border-t border-border/25 px-5 py-3">
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={cancel}
      >
        <Icon name="x" class="size-3.5 shrink-0" />
        {cancelLabel}
      </button>
      <button
        type="button"
        {disabled}
        class={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-ui-sm font-medium transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50',
          variant === 'destructive'
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground',
        )}
        onclick={confirm}
      >
        {#if confirmIcon}<Icon name={confirmIcon} class="size-3.5 shrink-0" />{/if}
        {confirmLabel}
        <!-- Says the key out loud, so the shortcut is discoverable rather than folklore. -->
        {#if confirmOnEnter}
          <kbd class="ml-0.5 -mr-0.5 rounded border border-current/25 px-1 font-sans text-ui-3xs leading-[1.4] opacity-60">↵</kbd>
        {/if}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
