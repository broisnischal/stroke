// Lightweight, dependency-free i18n. A reactive `locale` store drives a derived
// `t` store used as `$t('key', { vars })` in components; missing keys fall back
// to English, then to the key itself, so partial translation never breaks the UI.
//
// Migrating strings is incremental: wrap a literal in `$t('some.key')` and add
// the key to DICT.en (plus other locales as they're translated).

import { writable, derived } from 'svelte/store'

const STORAGE_KEY = 'stroke:locale'

/** Languages offered in the picker. */
export const LOCALES = /** @type {const} */ ([
  { id: 'en', label: 'English', native: 'English' },
  { id: 'es', label: 'Spanish', native: 'Español' },
  { id: 'fr', label: 'French', native: 'Français' },
  { id: 'de', label: 'German', native: 'Deutsch' },
  { id: 'pt', label: 'Portuguese', native: 'Português' },
  { id: 'ja', label: 'Japanese', native: '日本語' },
])

const LOCALE_IDS = new Set(LOCALES.map((l) => l.id))

function loadLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LOCALE_IDS.has(saved)) return saved
    const nav = (navigator.language || 'en').slice(0, 2)
    return LOCALE_IDS.has(nav) ? nav : 'en'
  } catch {
    return 'en'
  }
}

/** Current locale id (persisted). */
export const locale = writable(loadLocale())
locale.subscribe((v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v)
    if (typeof document !== 'undefined') document.documentElement.lang = v
  } catch { /* ignore */ }
})

/** @param {(typeof LOCALES)[number]['id']} id */
export function setLocale(id) {
  if (LOCALE_IDS.has(id)) locale.set(id)
}

// ── Dictionaries ──────────────────────────────────────────────────────────────
// Keyed by dotted namespace. English is the source of truth; other locales may
// be partial and fall back to English per key.
const DICT = {
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.edit': 'Edit',
    'common.search': 'Search…',
    'common.refresh': 'Refresh',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.copy': 'Copy',
    'common.settings': 'Settings',
    'common.loading': 'Loading…',
    'common.error': 'Error',
    'common.retry': 'Retry',
    'common.confirm': 'Confirm',
    'common.apply': 'Apply',
    'common.language': 'Language',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.language': 'Language',
    'settings.language.desc': 'Interface language',
    'connection.connect': 'Connect',
    'connection.disconnect': 'Disconnect',
    'connection.connecting': 'Connecting…',
    'connection.connected': 'Connected',
    'sidebar.tables': 'Tables',
    'sidebar.schemas': 'Schemas',
    'sidebar.noTables': 'No tables',
    'table.rows': 'rows',
    'table.row': 'row',
    'table.noRows': 'No rows',
    'table.columns': 'columns',
    'sql.run': 'Run',
    'sql.explain': 'Explain',
    'ai.ask': 'Ask AI',
  },
  es: {
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.close': 'Cerrar',
    'common.delete': 'Eliminar',
    'common.add': 'Añadir',
    'common.edit': 'Editar',
    'common.search': 'Buscar…',
    'common.refresh': 'Actualizar',
    'common.export': 'Exportar',
    'common.import': 'Importar',
    'common.copy': 'Copiar',
    'common.settings': 'Ajustes',
    'common.loading': 'Cargando…',
    'common.error': 'Error',
    'common.retry': 'Reintentar',
    'common.confirm': 'Confirmar',
    'common.apply': 'Aplicar',
    'common.language': 'Idioma',
    'settings.appearance': 'Apariencia',
    'settings.theme': 'Tema',
    'settings.language': 'Idioma',
    'settings.language.desc': 'Idioma de la interfaz',
    'connection.connect': 'Conectar',
    'connection.disconnect': 'Desconectar',
    'connection.connecting': 'Conectando…',
    'connection.connected': 'Conectado',
    'sidebar.tables': 'Tablas',
    'sidebar.schemas': 'Esquemas',
    'sidebar.noTables': 'Sin tablas',
    'table.rows': 'filas',
    'table.row': 'fila',
    'table.noRows': 'Sin filas',
    'table.columns': 'columnas',
    'sql.run': 'Ejecutar',
    'sql.explain': 'Explicar',
    'ai.ask': 'Preguntar a la IA',
  },
  fr: {
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.close': 'Fermer',
    'common.delete': 'Supprimer',
    'common.add': 'Ajouter',
    'common.edit': 'Modifier',
    'common.search': 'Rechercher…',
    'common.refresh': 'Actualiser',
    'common.export': 'Exporter',
    'common.import': 'Importer',
    'common.copy': 'Copier',
    'common.settings': 'Paramètres',
    'common.loading': 'Chargement…',
    'common.error': 'Erreur',
    'common.retry': 'Réessayer',
    'common.confirm': 'Confirmer',
    'common.apply': 'Appliquer',
    'common.language': 'Langue',
    'settings.appearance': 'Apparence',
    'settings.theme': 'Thème',
    'settings.language': 'Langue',
    'settings.language.desc': "Langue de l'interface",
    'connection.connect': 'Se connecter',
    'connection.disconnect': 'Se déconnecter',
    'connection.connecting': 'Connexion…',
    'connection.connected': 'Connecté',
    'sidebar.tables': 'Tables',
    'sidebar.schemas': 'Schémas',
    'sidebar.noTables': 'Aucune table',
    'table.rows': 'lignes',
    'table.row': 'ligne',
    'table.noRows': 'Aucune ligne',
    'table.columns': 'colonnes',
    'sql.run': 'Exécuter',
    'sql.explain': 'Expliquer',
    'ai.ask': "Demander à l'IA",
  },
  de: {
    'common.save': 'Speichern',
    'common.cancel': 'Abbrechen',
    'common.close': 'Schließen',
    'common.delete': 'Löschen',
    'common.add': 'Hinzufügen',
    'common.edit': 'Bearbeiten',
    'common.search': 'Suchen…',
    'common.refresh': 'Aktualisieren',
    'common.export': 'Exportieren',
    'common.import': 'Importieren',
    'common.copy': 'Kopieren',
    'common.settings': 'Einstellungen',
    'common.loading': 'Wird geladen…',
    'common.error': 'Fehler',
    'common.retry': 'Wiederholen',
    'common.confirm': 'Bestätigen',
    'common.apply': 'Anwenden',
    'common.language': 'Sprache',
    'settings.appearance': 'Darstellung',
    'settings.theme': 'Design',
    'settings.language': 'Sprache',
    'settings.language.desc': 'Sprache der Oberfläche',
    'connection.connect': 'Verbinden',
    'connection.disconnect': 'Trennen',
    'connection.connecting': 'Verbindung…',
    'connection.connected': 'Verbunden',
    'sidebar.tables': 'Tabellen',
    'sidebar.schemas': 'Schemata',
    'sidebar.noTables': 'Keine Tabellen',
    'table.rows': 'Zeilen',
    'table.row': 'Zeile',
    'table.noRows': 'Keine Zeilen',
    'table.columns': 'Spalten',
    'sql.run': 'Ausführen',
    'sql.explain': 'Erklären',
    'ai.ask': 'KI fragen',
  },
  // pt / ja fall back to English until translated.
  pt: {},
  ja: {},
}

/**
 * @param {string} loc @param {string} key @param {Record<string, unknown>} [vars]
 */
function translate(loc, key, vars) {
  const s = DICT[loc]?.[key] ?? DICT.en[key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s
}

/**
 * Reactive translator. Usage in a component: `{$t('common.save')}` or
 * `{$t('greeting', { name })}`. Re-runs when the locale changes.
 * @type {import('svelte/store').Readable<(key: string, vars?: Record<string, unknown>) => string>}
 */
export const t = derived(locale, ($loc) => (key, vars) => translate($loc, key, vars))
