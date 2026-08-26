# Plugin API

Stroke loads plugins from a folder. A plugin is a `manifest.json` and one
JavaScript file, it runs inside a Worker with the network taken away, and it
gets one job in generation 1: turn a cell value into a render directive.

This is the same contract the twenty built-in extensions use. The difference is
where the code comes from and what it is allowed to reach.

## The shortest plugin that does something

```
my-plugin/
  manifest.json
  main.js
```

`manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "kind": "formatter",
  "entry": "main.js",
  "description": "What it does, in one line.",
  "author": "You",
  "homepage": "https://example.com",
  "permissions": ["cells:read"]
}
```

`main.js`:

```js
module.exports = {
  appliesTo(type, name) {
    return /(^|_)email($|_)/i.test(name)
  },
  format(value) {
    if (typeof value !== 'string' || !value.includes('@')) return null
    return { link: `mailto:${value}`, fg: '#60a5fa' }
  },
}
```

Install it: **Extensions** panel, `+`, pick the folder. Turn it on. Open a table
with an `email` column.

A working example lives in `examples/plugins/traffic-light/`, and the types are
in `types/stroke-plugin.d.ts`.

## The manifest

| Field | Required | Rules |
|---|---|---|
| `id` | yes | 2 to 48 characters, lowercase letters, digits, single hyphens. It **is** the folder name, and the two must match. |
| `name` | yes | Shown in the Extensions panel. |
| `version` | yes | Any string. Shown as `v1.0.0`. |
| `apiVersion` | yes | `1`. A host refuses a generation it does not implement. |
| `kind` | yes | `formatter`. The only hook generation 1 runs. |
| `entry` | yes | A bare `.js` or `.mjs` filename in the plugin folder. No paths. |
| `description`, `author`, `homepage` | no | Shown in the panel. |
| `permissions` | no | Only `cells:read`. See below. |

A folder that fails any of these still appears in the panel, marked **Broken**
with the reason. It is never executed.

## The plugin object

Assign to `module.exports`. The entry file is evaluated as a CommonJS module,
not an ES module, so there is no build step and no bundler between you and the
app.

### `appliesTo(type, name, config) => boolean`

Whether this plugin has an opinion about a column. Optional; omit it and you are
asked about every column.

Asked **once per column**, and a `false` is remembered: `format` is never called
for that column's cells again. This is the single most important function in
your plugin for performance. Match on the column name and type, narrowly.

### `format(value, ctx) => directive | null`

Turn one value into a directive, or return `null` to leave the cell as it was.

- `value` is a `string`, `number`, `boolean` or `null`. JSON columns and arrays
  are not offered in generation 1.
- `ctx` is `{ type, name, config }`.
- It must be **pure**. Results are cached per distinct value per column, so the
  same value must always produce the same directive. A `format` that reads the
  clock or a counter will look broken.
- Budget: 2 seconds per batch. Three timeouts or throws and the plugin is
  switched off with a reason in the panel.

## Directive fields

| Field | Type | Effect |
|---|---|---|
| `display` | string | Text drawn instead of the value |
| `title` | string | Tooltip |
| `badge` | `{bg, fg}` | Pill behind the text |
| `swatch` | colour | Square before the text |
| `dot` | colour | Dot before the text |
| `fg` | colour | Text colour |
| `bgTint` | colour | Cell background |
| `mask` | string | Text shown until the cell is revealed |
| `reveal` | boolean | Whether a masked cell starts revealed |
| `link` | string | Makes the cell a link |
| `warn` | string | Warning against the cell |

Colours must be `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` or `rgba(...)`.
Links must be `http:`, `https:`, `mailto:` or `tel:`. Anything else in either
position is dropped, along with every field not in this table. Strings are
capped at 512 characters (2048 for `link`) and stripped of control characters.

Built-in extensions win any field they also set: a plugin adds to the picture
rather than overriding what ships in the app.

## What a plugin can and cannot reach

It runs in a Worker, so there is no DOM, no `window`, no app state, and no
Tauri bridge - a plugin cannot query the database, read a connection, or draw
anything itself. Before your code is evaluated, the host also removes `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `importScripts`,
`indexedDB`, `caches`, `BroadcastChannel`, `localStorage` and `sessionStorage`.
A generation 1 plugin has no way out to the network.

`permissions` therefore accepts exactly one entry, `cells:read`: the values of
the columns your `appliesTo` accepted. Declaring anything else marks the plugin
broken, on purpose. A permission the host cannot police is a promise it cannot
keep, so the list grows only as enforcement does.

Installing copies your folder into the app's data directory, taking only `.js`,
`.mjs`, `.json`, `.md`, `.txt` and `.svg` files, from the top level, up to 4 MB
in total with a 1 MB cap on the entry file.

## How it performs

Formatters are consulted per visible cell per repaint, and a Worker answers
asynchronously, so the host does not wait for you:

1. The grid asks for a cell's directive. On a cache hit it draws it.
2. On a miss it draws the cell plain and notes the value.
3. On the next tick, the distinct missed values of each column go out in one
   message, up to 400 at a time.
4. When answers land, the grid repaints with them.

So your first paint of a new value is plain, and the next frame has your
directive. Low-cardinality columns (a status, a role, a boolean) collapse to a
handful of calls no matter how many rows are on screen.

## Development loop

Edit `main.js`, press **Reload** on the plugin in the Extensions panel. That
re-reads the file from disk and restarts its Worker. No build, no restart.

Errors show under the plugin's row in the panel. A plugin that throws on load
never runs; one that throws while formatting has that cell drawn plain.

## Not in generation 1

Context-menu items, export formats, SQL generators, AI tools, connection
providers, plugin-owned tabs, network access through a host proxy, per-plugin
storage, and a registry to install from. The hook contract and the manifest were
built with these in mind: each is a new `kind` and, where it reaches something,
a new permission the host enforces in Rust.
