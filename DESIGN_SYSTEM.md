# Stroke — Design System

Single source of truth for UI in this app. Every surface (sidebar, toolbars,
modals, pages, menus, tables) must follow this. When a component disagrees with
this file, the component is wrong — fix the component.

Goal: **modern, minimal, production-grade, and identical across the whole app.**
The tokens already exist in `src/app.css` + the theme files. The problem this
file solves is *consistent use* of them — no more arbitrary `text-[13px]`,
mismatched control heights, or one-off selected states.

---

## 0. Golden rules (read first)

1. **Never use an arbitrary font size** (`text-[13px]`, `text-[10.5px]`, …).
   Use the `text-ui-*` scale only. (There are ~370 legacy `text-[Npx]` uses —
   these are being migrated; do not add new ones.)
2. **Never use an arbitrary color.** Use semantic tokens (`text-foreground`,
   `bg-muted`, `border-border`, …). No hex, no `bg-[#…]`, no raw `text-gray-500`.
3. **Control heights are fixed:** `h-7` compact · `h-8` default · `h-9` field.
   Never invent `h-[34px]`.
4. **Icons use the sizing table** (§5). Body-adjacent icons are `size-3.5`.
5. **Radius is a 3-step scale** (§4). Interactive → `rounded-md`; containers →
   `rounded-lg`; floating panels → `rounded-[10px]`.
6. **Reuse the component before styling a new one.** Dropdown = `SearchableMenu`.
   List row = the row pattern (§8). Icon button = the icon-button class (§6).
7. **Spacing is the 4px grid** via Tailwind `gap-*`/`p-*`. Prefer `gap-*` on flex.
8. Match the density of the surrounding surface. Toolbars/status bar are dense
   (`text-ui-2xs`/`text-ui-xs`); page content breathes more.

---

## 1. Foundations

### Fonts (`src/app.css`)
| Role | Variable | Stack |
|---|---|---|
| UI / sans | `--font-sans` | Geist Variable → system-ui |
| Data / mono | `--font-mono` | Geist Mono Variable → ui-monospace |
| Code editor | `--editor-font-family` | JetBrains Mono → Geist Mono |

- **Sans** for all chrome, labels, prose, buttons.
- **Mono** (`font-mono`) for data: identifiers, values, counts, IDs, SQL,
  hostnames, table/column names, timings. Numbers in stat cards use
  `font-mono tabular-nums`.

### Base size
`1rem = --app-font-size = 14px`. Everything scales off this; the app supports
zoom by design, so **rem-based tokens only** (the `text-ui-*` classes are rem).

---

## 2. Type scale (the only sizes allowed)

| Class | px @100% | Use for |
|---|---|---|
| `text-ui-2xl` | 20 | page/section hero titles (rare) |
| `text-ui-xl` | 18 | dialog titles, empty-state headings |
| `text-ui-lg` | 16 | card/panel titles, primary headings |
| `text-ui` | 14 | **default body**, inputs, buttons, menu items |
| `text-ui-sm` | 13 | secondary body, dense menu items, table cells |
| `text-ui-xs` | 12 | metadata, toolbar labels, helper text |
| `text-ui-2xs` | 11 | dense chrome (status bar, chips, counts) |
| `text-ui-3xs` | 10 | micro-labels only (uppercase section labels) — floor |

> If `text-ui-2xl/xl/lg` are missing in `app.css`, add them alongside the
> existing scale (same `calc(N/14 * 1rem)` pattern) — see §12.

**Weights:** `font-normal` body · `font-medium` emphasis/active · `font-semibold`
titles + micro-labels. Never `font-bold` in chrome.

**Line-height:** default for single-line controls; `leading-relaxed` for
multi-line helper text; `leading-snug` for tight list rows.

**Never below 10px.** `text-[8px]/[9px]` are shimmed up to 10px — don't rely on it.

---

## 3. Color (semantic tokens only)

Themeable via the theme files (oklch, WCAG-AA contrast floor). Use tokens, never
literal colors.

| Token | Meaning |
|---|---|
| `background` | app base |
| `panel` | content/main region surface |
| `sidebar` / `sidebar-foreground` | sidebar surface |
| `popover` / `popover-foreground` | floating menus/dialogs |
| `muted` / `muted-foreground` | subtle fills / secondary text |
| `accent` / `accent-foreground` | hover + active chrome fill |
| `foreground` | primary text |
| `border` | all hairlines/dividers |
| `primary` / `primary-foreground` | primary actions, active accents |
| `destructive` | delete/danger |
| `ring` | focus ring |

**Opacity conventions (consistency matters most here):**
- Secondary text: `text-muted-foreground`. Tertiary: `text-muted-foreground/60`.
- Hairlines: `border-border` (structural) · `border-border/50` (internal dividers).
- Idle icon buttons: `text-muted-foreground` → hover `text-foreground`.
- **Selected/active row (canonical):** `bg-accent text-foreground` for chrome;
  `bg-primary/10 text-foreground ring-1 ring-primary/25` for prominent pick lists
  (provider DB lists, account lists). **Pick one per context and never mix
  `/10` vs `/15`, `/25` vs `/30`.**
- Never use a full `bg-accent`/`bg-primary` *fill* on a small icon — reads loud.
  Subtle chip = `bg-foreground/[0.08]`.

---

## 4. Radius

| Class | Use |
|---|---|
| `rounded-md` | buttons, icon buttons, inputs, menu items, chips |
| `rounded-lg` | cards, panels, grouped containers, field wrappers |
| `rounded-[10px]` | floating popovers / command menus |
| `rounded-full` | dots, pills, avatars, status indicators |

No other radii. No `rounded-xl`/`rounded-sm` in new code unless matching a
`rounded-[10px]` popover neighbor.

---

## 5. Icons (`@lucide/svelte` only)

| Size | px | Use |
|---|---|---|
| `size-3` | 12 | inside dense chips / status bar |
| `size-3.5` | 14 | **default** — buttons, menu items, toolbars, inline |
| `size-4` | 16 | list rows, card headers, section titles |
| `size-5` | 20 | empty-state / feature icons |

- Always `shrink-0` on icons inside flex rows.
- Square sizing via `size-*` (never `w-4 h-4`).
- One icon set. No custom SVG unless truly bespoke.

---

## 6. Controls

### Heights
`h-7` compact (toolbar/menu triggers, chips) · `h-8` medium · `h-9` primary
form fields & the main toolbar row.

### Icon button (canonical class)
```
inline-flex size-7 items-center justify-center rounded-md
text-muted-foreground transition-colors
hover:bg-accent hover:text-foreground
disabled:pointer-events-none disabled:opacity-40
```
Active/toggled adds `bg-accent text-foreground` (or `text-primary` for a
semantic on-state like AI/read-only).

### Text/label button
```
flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-sm
transition-colors hover:bg-accent hover:text-foreground
data-[state=open]:bg-accent data-[state=open]:text-foreground
```

### Primary button
Use `Button` from `ui/button`. Solid: `bg-primary text-primary-foreground
hover:opacity-90`. Never hand-roll a primary button.

### Inputs / selects
`h-9 rounded-lg border border-border bg-muted/30 px-3 text-ui`, focus:
`focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none`. Prefer the
`Input` / `Select` wrappers in `ui/*`.

---

## 7. Dropdowns & menus

- **Searchable dropdown** (account/db/column pickers, anything filterable) →
  `SearchableMenu.svelte`. Panel: `rounded-[10px] border-border/60 bg-popover
  elevate-2-rim`, width matches trigger via `w-[var(--bits-popover-anchor-width)]`
  (add `min-w-[240px]`).
- **Action menu** (non-filterable) → `ui/dropdown-menu`. Items `text-ui-sm`,
  leading `size-3.5` icon, `gap-2`.
- One active dialog/menu at a time from the global hotkey flow.

### Menu width (hard rule)

- **Never put a fixed `w-*` on a menu panel** (`Content` / `SubContent`). Use
  `min-w-*`. Panels shrink-to-fit, so a fixed width cannot grow for a label that
  does not fit — the text simply paints outside the rounded border. Labels are
  `$t(...)` strings, and a width tuned to English overflows in longer locales.
- Every panel is capped at `--menu-max-w` (`src/app.css`) and clips with
  `overflow-x-hidden`, so nothing can escape the panel even at the ceiling.
- Menu items carry `min-w-0`. To truncate a genuinely unbounded label (a column
  name, a path, a cell value), wrap it: `<span class="min-w-0 flex-1 truncate">`
  — same idea as the `data-slot="command-label"` rule in the command palette.

---

## 8. List row pattern (files, tables, dbs, connections)

```
flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors
<idle>     hover:bg-muted/50   text-foreground/85
<selected> bg-primary/10 text-foreground ring-1 ring-primary/25
```
- Leading `size-4` icon (`text-muted-foreground/45` idle, `text-foreground`
  selected), `shrink-0`.
- Label: `min-w-0 flex-1 truncate` (+ `font-mono` for identifiers).
- Trailing metadata: `text-ui-2xs text-muted-foreground/40`, `ml-auto` or after
  the flex-1 label; selected → trailing `Check size-3.5 text-primary`.
- Search box above long lists (>6): `h-9`, leading `Search size-3.5` at `left-3`,
  input `pl-9 text-ui-sm`, divider `border-b border-border/50`.

---

## 9. Cards / panels / stat blocks

- Card: `rounded-lg border border-border bg-panel` (or `bg-muted/[0.04]` for a
  softer inset). Padding `p-3`/`p-4`. Title `text-ui-lg font-semibold`.
- Stat card: label `text-ui-2xs font-semibold uppercase tracking-[0.06em]
  text-muted-foreground/60`, value `text-ui-lg font-mono tabular-nums
  text-foreground`. **Align every card in a row to the same internal grid** —
  the Insights screenshot fails here; use a shared stat sub-component so label/
  value/secondary rows line up across all cards.
- Section grids: `grid gap-3` (cards), consistent column counts; never mix
  `gap-1.5` and `gap-4` in sibling grids.

---

## 10. Micro-labels (uppercase section labels)

```
text-ui-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/55
```
Used for ACCOUNT / D1 DATABASE / PINNED / TABLES etc. Always this exact recipe.

---

## 11. Do / Don't

**Do**
- Reuse `ui/*` wrappers and the shared patterns above.
- Keep one selected-state recipe per context.
- Right-size touch targets (≥ `size-7` for clickable icons).
- Use `tabular-nums` for any changing/aligned numbers.

**Don't**
- No arbitrary `text-[Npx]`, `h-[Npx]`, hex colors, `rounded-xl`.
- No loud full-accent fills on small icons.
- No new bespoke dropdown/list markup — extend the shared component.
- No `font-bold` in chrome; no ALL-CAPS body text.

---

## 12. Rollout plan (apply this file to the app)

Execute in phases, one focused pass each (compact context between phases):

1. **Tokens** — ensure `app.css` has `text-ui-lg/xl/2xl` (add if missing). Keep
   the `text-[Npx]→rem` shims as a safety net during migration.
2. **Primitives audit** — `ui/*` (button, input, select, dropdown-menu, dialog,
   command) conform to §6/§7. Fix these first; everything inherits.
3. **Shared patterns** — extract/verify: icon-button class, list-row, stat-card,
   micro-label, `SearchableMenu`, provider DB picker (dedupe CloudflareLogin ↔
   ProviderConnect into one component).
4. **Chrome** — TitleBar, ActivityBar, Sidebar, TableToolbar, SqlConsole header,
   StatusBar: unify heights, icon sizes, label sizes to the scale.
5. **Pages** — Insights, Security, Schema, ERD, ORM, Backup, Dashboard, Diagrams,
   Connection modal: card grids aligned, titles on `text-ui-lg`, spacing on grid.
6. **Sweep** — grep-replace arbitrary `text-[Npx]` → nearest `text-ui-*`; fix
   stray radii/colors. Verify build + a visual pass per page.

Track each phase's diffs against this file; when in doubt, this file wins.
