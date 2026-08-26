// Types shared between the plugin host and the UI. Runtime-free: this file
// exists so `import('...types.js').ExternalPluginInfo` resolves in JSDoc.

/**
 * One installed plugin folder, as `plugins_list` reports it. A folder that
 * failed validation still appears, with `loadable: false` and `error` set - the
 * panel shows the reason rather than pretending the folder is not there.
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   version: string,
 *   apiVersion: number,
 *   kind: 'formatter',
 *   description: string,
 *   author: string,
 *   homepage: string,
 *   permissions: string[],
 *   dir: string,
 *   entry: string,
 *   sourceHash: string,
 *   bytes: number,
 *   loadable: boolean,
 *   error: string,
 * }} ExternalPluginInfo
 */

export {}
