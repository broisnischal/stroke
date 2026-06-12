import { openDB } from 'idb'

export const DB_NAME = 'stroke'
export const DB_VERSION = 3

export const STORES = {
  conversations: 'conversations',
  queryHistory: 'query-history',
  savedQueries: 'saved-queries',
  schemaSnapshots: 'schema-snapshots',
}

/** @returns {Promise<import('idb').IDBPDatabase>} */
export function getStudioDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORES.conversations)) {
        const store = db.createObjectStore(STORES.conversations, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORES.queryHistory)) {
        const store = db.createObjectStore(STORES.queryHistory, { keyPath: 'id' })
        store.createIndex('connectionId', 'connectionId')
        store.createIndex('executedAt', 'executedAt')
      }
      if (!db.objectStoreNames.contains(STORES.savedQueries)) {
        const store = db.createObjectStore(STORES.savedQueries, { keyPath: 'id' })
        store.createIndex('connectionId', 'connectionId')
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORES.schemaSnapshots)) {
        const store = db.createObjectStore(STORES.schemaSnapshots, { keyPath: 'id' })
        store.createIndex('connectionId', 'connectionId')
        store.createIndex('capturedAt', 'capturedAt')
      }
    },
  })
}
