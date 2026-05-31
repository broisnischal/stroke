/**
 * Generate contextual query suggestions from schema context.
 * @param {{
 *   activeSchema: string,
 *   tables: { name: string, rowCount?: number }[],
 *   activeTable: string | null,
 *   columns: { name: string, dataType: string }[],
 *   foreignKeys: { columns: string[], referencedTable: string }[],
 * }} ctx
 * @returns {{ label: string, prompt: string }[]}
 */
export function generateSuggestions(ctx) {
  const { activeSchema, tables, activeTable, columns, foreignKeys } = ctx
  /** @type {{ label: string, prompt: string }[]} */
  const suggestions = []

  const tbl = activeTable ? `${activeSchema}.${activeTable}` : null
  const colNames = columns.map((c) => c.name.toLowerCase())

  const hasCol = (/** @type {string[]} */ ...names) =>
    names.some((n) => colNames.some((c) => c === n || c.includes(n)))

  // --- Active table suggestions ---
  if (tbl && activeTable) {
    suggestions.push({
      label: `Browse ${activeTable}`,
      prompt: `Show me the first 20 rows of ${tbl}`,
    })

    suggestions.push({
      label: `Count rows`,
      prompt: `How many rows are in ${tbl}?`,
    })

    if (hasCol('created_at', 'createdat', 'created', 'inserted_at')) {
      suggestions.push({
        label: `Recent records`,
        prompt: `Show me the 10 most recently created rows in ${tbl}`,
      })
    }

    if (hasCol('updated_at', 'updatedat', 'modified_at')) {
      suggestions.push({
        label: `Recently updated`,
        prompt: `Show me the 10 most recently updated rows in ${tbl}`,
      })
    }

    if (hasCol('status', 'state', 'type', 'role')) {
      const col = columns.find((c) => ['status', 'state', 'type', 'role'].includes(c.name.toLowerCase()))
      if (col) {
        suggestions.push({
          label: `Group by ${col.name}`,
          prompt: `Count rows in ${tbl} grouped by ${col.name}, ordered by count descending`,
        })
      }
    }

    if (hasCol('email')) {
      suggestions.push({
        label: `Duplicate emails`,
        prompt: `Find duplicate email addresses in ${tbl}`,
      })
    }

    if (hasCol('deleted_at', 'deletedat', 'is_deleted', 'archived_at')) {
      suggestions.push({
        label: `Soft-deleted rows`,
        prompt: `Show soft-deleted rows in ${tbl} (where deleted_at IS NOT NULL)`,
      })
    }

    if (hasCol('amount', 'price', 'total', 'cost', 'revenue', 'value')) {
      const col = columns.find((c) =>
        ['amount', 'price', 'total', 'cost', 'revenue', 'value'].includes(c.name.toLowerCase()),
      )
      if (col) {
        suggestions.push({
          label: `Sum of ${col.name}`,
          prompt: `What is the total, average, min, and max of ${col.name} in ${tbl}?`,
        })
      }
    }

    // FK join suggestions
    for (const fk of foreignKeys.slice(0, 2)) {
      const refTable = `${activeSchema}.${fk.referencedTable}`
      suggestions.push({
        label: `Join → ${fk.referencedTable}`,
        prompt: `Show ${tbl} joined with ${refTable} on ${fk.columns[0]}, limit 10`,
      })
    }

    suggestions.push({
      label: `Null check`,
      prompt: `Which columns in ${tbl} have the most NULL values?`,
    })

    suggestions.push({
      label: `Table size`,
      prompt: `How much disk space does ${tbl} use?`,
    })
  }

  // --- Schema-level suggestions ---
  if (tables.length > 0) {
    const sorted = [...tables].sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0))
    const biggest = sorted[0]
    if (biggest && biggest.name !== activeTable) {
      suggestions.push({
        label: `Browse ${biggest.name}`,
        prompt: `Show me the first 20 rows of ${activeSchema}.${biggest.name}`,
      })
    }

    suggestions.push({
      label: `Schema overview`,
      prompt: `List all tables in the "${activeSchema}" schema with their row counts`,
    })

    suggestions.push({
      label: `Row counts for all tables`,
      prompt: `Show a ranked list of all tables in "${activeSchema}" ordered by number of rows descending`,
    })

    if (tables.length >= 3) {
      suggestions.push({
        label: `Foreign key relationships`,
        prompt: `Show all foreign key relationships between tables in the "${activeSchema}" schema`,
      })
    }

    if (tables.length >= 2) {
      suggestions.push({
        label: `Find recent activity`,
        prompt: `Which tables in "${activeSchema}" have a created_at or updated_at column? Show the 10 most recent rows from the busiest one.`,
      })
    }

    suggestions.push({
      label: `Spot duplicate records`,
      prompt: `Check the tables in "${activeSchema}" for any obvious duplicate rows or duplicate values in likely unique columns`,
    })

    suggestions.push({
      label: `Database size breakdown`,
      prompt: `Show the disk size of each table in the "${activeSchema}" schema, ordered largest first`,
    })

    if (sorted[1] && sorted[1].name !== activeTable) {
      suggestions.push({
        label: `Explore ${sorted[1].name}`,
        prompt: `Show me a sample of ${activeSchema}.${sorted[1].name} with column descriptions`,
      })
    }
  }

  // Deduplicate and limit
  const seen = new Set()
  return suggestions.filter((s) => {
    if (seen.has(s.label)) return false
    seen.add(s.label)
    return true
  }).slice(0, 8)
}
