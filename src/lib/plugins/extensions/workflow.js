// Workflow extensions - table-level features (not cell hooks). They register
// here so the Extensions page can present and toggle them like everything
// else; the actual UI lives in the table toolbar / dialogs and checks
// isPluginEnabled()/pluginEnabledIn() before rendering.

export const savedViews = {
  id: 'saved-views',
  name: 'Saved Views',
  description:
    'Save a named combination of filters, sort, search, hidden columns and view mode per table: "Active users", "Failed payments this week", and switch between them from the toolbar.',
  kind: 'workflow',
}

export const findReplace = {
  id: 'find-replace',
  name: 'Find & Replace',
  description:
    'Find and replace values inside a column across the loaded page: exact, contains or regex with capture groups, with a full preview of every change before anything is written.',
  kind: 'workflow',
}
