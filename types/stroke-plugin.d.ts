/**
 * Stroke plugin API, generation 1.
 *
 * Drop this file next to a plugin and reference it to get checked types:
 *
 *   /// <reference path="./stroke-plugin.d.ts" />
 *   /** @type {StrokePlugin} *\/
 *   module.exports = { appliesTo, format }
 *
 * The contract is frozen for the lifetime of `apiVersion: 1`. Fields may be
 * added; nothing here changes meaning or disappears without the generation
 * going to 2, and a host only loads plugins whose generation it implements.
 */

/** A render directive: what a formatter asks the grid to do with one cell. */
export interface StrokeDirective {
  /** Text drawn instead of the raw value. */
  display?: string
  /** Tooltip on hover. */
  title?: string
  /** Pill behind the text. Both colours are required, as `#rgb`, `#rrggbb`,
   *  `#rrggbbaa`, `rgb(...)` or `rgba(...)`. Any other notation is dropped. */
  badge?: { bg: string; fg: string }
  /** Small square swatch before the text, for colour-valued columns. */
  swatch?: string
  /** Small dot before the text, for status-valued columns. */
  dot?: string
  /** Text colour. */
  fg?: string
  /** Cell background tint. */
  bgTint?: string
  /** Text drawn in place of the value until the cell is revealed. */
  mask?: string
  /** Whether a masked cell starts revealed. */
  reveal?: boolean
  /** Makes the cell a link. `http:`, `https:`, `mailto:` and `tel:` only. */
  link?: string
  /** Warning shown against the cell, for validators. */
  warn?: string
}

/** Context passed to `format`. */
export interface StrokeFormatContext {
  /** Column type as the database engine reports it, lowercased by the engine. */
  type: string
  /** Column name. */
  name: string
  /** This plugin's configuration, as the user set it. */
  config: Record<string, unknown>
}

/** The object a formatter plugin assigns to `module.exports`. */
export interface StrokePlugin {
  /**
   * Whether this plugin has an opinion about a column. Asked once per column,
   * and a `false` means `format` is never called for that column's cells - so
   * being specific here is what keeps a plugin off the render path.
   *
   * Omit it and the plugin is asked about every column.
   */
  appliesTo?(type: string, name: string, config: Record<string, unknown>): boolean

  /**
   * Turn one cell value into a directive, or return null to leave it alone.
   *
   * Called with the distinct values of a column, batched, and the result is
   * cached per value - so it must be pure: same value in, same directive out.
   * It runs inside a Worker with a 2 second budget per batch; three timeouts or
   * throws and the plugin is switched off.
   *
   * Values arrive as string, number, boolean or null. Objects and arrays (JSON
   * columns) are not offered in generation 1.
   */
  format(value: string | number | boolean | null, ctx: StrokeFormatContext): StrokeDirective | null
}

/** The host object injected as `stroke` into a plugin's module scope. */
export interface StrokeHost {
  /** Plugin API generation this host implements. */
  readonly apiVersion: 1
  /** One-way logging. Deliberately quiet - the host drops the output rather
   *  than letting a per-cell log flood the console. */
  log(...args: unknown[]): void
}

declare global {
  const stroke: StrokeHost
  const module: { exports: StrokePlugin | { default: StrokePlugin } }
}
