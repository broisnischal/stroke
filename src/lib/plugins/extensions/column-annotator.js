// Column annotators — a thin distribution strip under each column header.
// Numeric columns get a mini histogram; others get a non-null fill bar.
// The actual rendering happens on the table canvas (it needs the column stats
// the table already computes); this entry just exposes the on/off toggle.
export const columnAnnotator = {
  id: 'column-annotator',
  name: 'Column Annotators',
  description: 'Mini histogram / fill bar under each column header.',
  kind: 'annotator',
  needsStats: true,
}
