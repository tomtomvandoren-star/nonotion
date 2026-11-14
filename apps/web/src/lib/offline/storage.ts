/**
 * Le stockage de l'appareil pour le travail hors ligne (spec 6.16) : une petite base IndexedDB,
 * dans le dossier privé de l'application. Sans IndexedDB (tests, navigation privée), la mémoire
 * prend le relais : tout marche, rien ne survit à la fermeture.
 */

const DB_NAME = 'nonotion-offline'
const STORE = 'kv'

const memory = new Map<string, unknown>()
let opening: Promise<IDBDatabase | null> | null = null

function database(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return database().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) {
          resolve(undefined)
          return
        }
        try {
          const request = action(db.transaction(STORE, mode).objectStore(STORE))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

export async function readKey<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T
  const value = await run<T>('readonly', (store) => store.get(key) as IDBRequest<T>)
  if (value !== undefined) memory.set(key, value)
  return value
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  memory.set(key, value)
  await run('readwrite', (store) => store.put(value, key))
}

export async function deleteKey(key: string): Promise<void> {
  memory.delete(key)
  await run('readwrite', (store) => store.delete(key))
}

/** Tout oublier : à la déconnexion, la copie locale et la file d'attente disparaissent. */
export async function clearAll(): Promise<void> {
  memory.clear()
  await run('readwrite', (store) => store.clear())
}
