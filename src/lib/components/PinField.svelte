<script>
  // Segmented PIN entry: one real input, made invisible and stretched over a row
  // of boxes. Per-box inputs are the usual approach and the usual source of bugs
  // (paste, backspace-across-boxes, autofill, IME); a single field keeps
  // selection and clipboard behaviour native and leaves the boxes as pure paint.
  let {
    value = $bindable(''),
    length = 6,
    disabled = false,
    /** Paints the boxes red without clearing what was typed. */
    invalid = false,
    autofocus = false,
    /** Fires on the last digit and on Enter. @type {(pin: string) => void} */
    onsubmit = () => {},
    'aria-label': ariaLabel = 'PIN',
  } = $props()

  /** @type {HTMLInputElement | null} */
  let el = $state(null)
  let focused = $state(false)

  export function focus() {
    el?.focus()
  }

  $effect(() => {
    if (!autofocus) return
    // One frame later: the dialog/overlay it lives in is still mounting.
    const id = setTimeout(() => el?.focus(), 40)
    return () => clearTimeout(id)
  })

  /** @param {Event & { currentTarget: HTMLInputElement }} e */
  function handleInput(e) {
    const digits = e.currentTarget.value.replace(/\D+/g, '').slice(0, length)
    // Write the sanitised text straight back so a rejected character never
    // flashes in the (invisible, but selectable) field.
    e.currentTarget.value = digits
    value = digits
    if (digits.length === length) onsubmit(digits)
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onsubmit(value)
    }
  }
</script>

<div class="relative flex items-center justify-center gap-2">
  {#each Array.from({ length }) as _, i (i)}
    <div
      class="flex h-10 w-9 items-center justify-center rounded-lg border-2 transition-[border-color,background-color] duration-150
        {invalid
        ? 'border-destructive/70 bg-destructive/5'
        : focused && i === value.length && value.length < length
          ? 'border-ring/70 bg-muted/30'
          : value.length > i
            ? 'border-border bg-muted/25'
            : 'border-border/45 bg-transparent'}"
    >
      {#if value.length > i}
        <span
          class="size-2 rounded-full transition-colors {invalid ? 'bg-destructive' : 'bg-foreground'}"
        ></span>
      {/if}
    </div>
  {/each}

  <input
    bind:this={el}
    {disabled}
    value={value}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    type="password"
    inputmode="numeric"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
    maxlength={length}
    aria-label={ariaLabel}
    class="absolute inset-0 h-full w-full cursor-default rounded-lg bg-transparent text-transparent opacity-0 outline-none caret-transparent"
  />
</div>
