import { platform } from '@/platform'
import { isOnline } from './network'
import { readKey, writeKey } from './storage'

/**
 * Les fichiers gardés sur l'appareil (spec 6.16, complément du 16 novembre) : chaque fichier envoyé
 * dans Nonotion qu'on affiche ou ouvre y est copié, pour s'afficher aussi hors ligne. Les moins
 * récemment utilisés partent au-delà de 500 Mo, ou après 60 jours sans usage. Un fichier ajouté
 * hors ligne y attend son envoi, sous une adresse locale (« nonotion-file:<identifiant> ») que la
 * page reçoit tout de suite et qui est remplacée par la vraie une fois le fichier envoyé.
 *
 * Seulement dans les applications natives (le site ne garde rien, 1.6.10). Sans IndexedDB (tests),
 * la mémoire prend le relais.
 */

export const LOCAL_FILE = 'nonotion-file:'
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024
export const MAX_FILE_BYTES = 100 * 1024 * 1024
export const MAX_AGE_MS = 60 * 24 * 3_600_000
/** L'heure d'usage n'est réécrite qu'une fois par heure (pas à chaque affichage). */
const TOUCH_EVERY_MS = 3_600_000
const REPLACED_KEY = 'files:replaced'

export interface FileMeta {
  size: number
  type: string
  usedAt: number
}

/* Le stockage : une base IndexedDB à part (le contenu, et un petit index pour le ménage). */

const DB_NAME = 'nonotion-files'
const memory = { blobs: new Map<string, Blob>(), meta: new Map<string, FileMeta>() }
let opening: Promise<IDBDatabase | null> | null = null

function database(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('blobs')
        request.result.createObjectStore('meta')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

function request<T>(
  store: 'blobs' | 'meta',
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
) {
  return database().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const req = action(db.transaction(store, mode).objectStore(store))
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

/**
 * Le contenu est rangé en octets (ArrayBuffer) avec son type, pas en Blob : certaines vues web
 * (WebKit, anciens iOS) refusent de ranger un Blob dans IndexedDB.
 */
type Stored = { data: ArrayBuffer; type: string }

async function getBlob(key: string): Promise<Blob | undefined> {
  if (!(await database())) return memory.blobs.get(key)
  const stored = await request<Stored>('blobs', 'readonly', (s) => s.get(key))
  return stored ? new Blob([stored.data], { type: stored.type }) : undefined
}

async function getMeta(key: string): Promise<FileMeta | undefined> {
  if (!(await database())) return memory.meta.get(key)
  return request<FileMeta>('meta', 'readonly', (s) => s.get(key))
}

async function putFile(key: string, blob: Blob, meta: FileMeta) {
  if (!(await database())) {
    memory.blobs.set(key, blob)
    memory.meta.set(key, meta)
    return
  }
  const stored: Stored = { data: await blob.arrayBuffer(), type: blob.type }
  await request('blobs', 'readwrite', (s) => s.put(stored, key))
  await request('meta', 'readwrite', (s) => s.put(meta, key))
}

async function putMeta(key: string, meta: FileMeta) {
  if (!(await database())) memory.meta.set(key, meta)
  else await request('meta', 'readwrite', (s) => s.put(meta, key))
}

/** `keepShown` : une page qui l'affiche encore garde son image jusqu'à son prochain chargement. */
async function deleteFile(key: string, keepShown = false) {
  if (!keepShown) {
    const url = objectUrls.get(key)
    if (url) URL.revokeObjectURL(url)
    objectUrls.delete(key)
  }
  if (!(await database())) {
    memory.blobs.delete(key)
    memory.meta.delete(key)
    return
  }
  await request('blobs', 'readwrite', (s) => s.delete(key))
  await request('meta', 'readwrite', (s) => s.delete(key))
}

async function allMeta(): Promise<[string, FileMeta][]> {
  if (!(await database())) return [...memory.meta.entries()]
  const [keys, values] = await Promise.all([
    request<string[]>('meta', 'readonly', (s) => s.getAllKeys()),
    request<FileMeta[]>('meta', 'readonly', (s) => s.getAll()),
  ])
  return (keys ?? []).map((key, i) => [String(key), values![i]!])
}

/* Les adresses */

const UPLOAD_PATH = /^\/uploads\/([0-9a-z]{26}\/[0-9a-z]{26}\/[A-Za-z0-9._-]+)$/

/** « <espace>/<identifiant>/<nom> » pour un fichier envoyé dans Nonotion, null sinon. */
export function uploadPath(url: string): string | null {
  try {
    return UPLOAD_PATH.exec(new URL(url).pathname)?.[1] ?? null
  } catch {
    return null
  }
}

/** La clé d'un fichier dans le stockage : le même fichier quel que soit le nom du serveur. */
function keyOf(url: string): string | null {
  if (url.startsWith(LOCAL_FILE)) return `local/${url.slice(LOCAL_FILE.length)}`
  const path = uploadPath(url)
  return path ? `uploads/${path}` : null
}

/** Les fichiers ajoutés hors ligne et envoyés depuis : adresse locale → vraie adresse ('' : refusé). */
const replaced = new Map<string, string>()

export async function loadReplaced(): Promise<void> {
  const saved = await readKey<Record<string, string>>(REPLACED_KEY)
  for (const [local, real] of Object.entries(saved ?? {})) replaced.set(local, real)
}

/** Remplace, dans un document ou un corps de requête, les adresses locales déjà envoyées. */
export function withUploadedUrls<T>(value: T): T {
  if (replaced.size === 0) return value
  let json = JSON.stringify(value)
  if (json === undefined || !json.includes(LOCAL_FILE)) return value
  for (const [local, real] of replaced)
    json = json.split(JSON.stringify(local).slice(1, -1)).join(real)
  return JSON.parse(json) as T
}

/* Les copies affichées */

const objectUrls = new Map<string, string>()

async function objectUrl(key: string): Promise<string | null> {
  const known = objectUrls.get(key)
  if (known) return known
  const blob = await getBlob(key)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  objectUrls.set(key, url)
  return url
}

async function touch(key: string) {
  const meta = await getMeta(key)
  if (meta && Date.now() - meta.usedAt > TOUCH_EVERY_MS)
    await putMeta(key, { ...meta, usedAt: Date.now() })
}

/**
 * Le ménage : les fichiers inutilisés depuis 60 jours, puis les moins récemment utilisés tant que
 * l'ensemble dépasse 500 Mo. Jamais un fichier ajouté hors ligne qui attend encore son envoi.
 */
export async function evictFiles(now = Date.now(), budget = MAX_TOTAL_BYTES): Promise<void> {
  const all = await allMeta()
  let total = all.reduce((sum, [, meta]) => sum + meta.size, 0)
  const entries = all
    .filter(([key]) => !key.startsWith('local/'))
    .sort((a, b) => a[1].usedAt - b[1].usedAt)
  for (const [key, meta] of entries) {
    if (now - meta.usedAt <= MAX_AGE_MS && total <= budget) break
    await deleteFile(key)
    total -= meta.size
  }
}

let fetchUpload: (path: string, signal: AbortSignal) => Promise<Response> = () =>
  Promise.reject(new Error('fetchUpload non configuré'))

/** Comment lire le contenu d'un fichier (par l'API, avec la session) : réglé au démarrage. */
export function configureFiles(fetcher: typeof fetchUpload) {
  fetchUpload = fetcher
}

const inFlight = new Set<string>()
/** Pendant cette session, ce qui n'a pas pu être copié n'est pas réessayé à chaque affichage. */
const failed = new Set<string>()

/** Garde une copie d'un fichier qu'on vient d'utiliser (en arrière-plan, s'il n'y est pas déjà). */
export async function keepFile(url: string): Promise<void> {
  if (!platform.offline) return
  const key = keyOf(url)
  const path = uploadPath(url)
  if (!key || !path || inFlight.has(key) || failed.has(key)) return
  if (await getMeta(key)) return touch(key)
  if (!isOnline()) return
  inFlight.add(key)
  const controller = new AbortController()
  try {
    const response = await fetchUpload(path, controller.signal)
    const length = Number(response.headers.get('Content-Length') ?? 0)
    if (!response.ok || length > MAX_FILE_BYTES) {
      controller.abort()
      failed.add(key)
      return
    }
    const blob = await response.blob()
    if (blob.size > MAX_FILE_BYTES) {
      failed.add(key)
      return
    }
    await putFile(key, blob, { size: blob.size, type: blob.type, usedAt: Date.now() })
    await evictFiles()
  } catch {
    // Coupure pendant la copie : elle sera retentée au prochain affichage.
  } finally {
    inFlight.delete(key)
  }
}

/** Un fichier qu'on vient d'envoyer en ligne : on a déjà son contenu, on le garde. */
export async function keepUploaded(url: string, blob: Blob): Promise<void> {
  const key = keyOf(url)
  if (!platform.offline || !key || blob.size > MAX_FILE_BYTES) return
  await putFile(key, blob, { size: blob.size, type: blob.type, usedAt: Date.now() })
  await evictFiles()
}

/**
 * L'adresse à afficher pour un fichier : sa copie sur l'appareil si elle existe (hors ligne comme en
 * ligne), sinon son adresse (et on en garde une copie). Une adresse locale : la copie, ou la vraie
 * adresse une fois le fichier envoyé.
 */
export async function resolveFile(url: string): Promise<string> {
  if (url.startsWith(LOCAL_FILE)) {
    const real = replaced.get(url)
    const local = await objectUrl(keyOf(url)!)
    if (local) return local
    if (real) return resolveFile(real)
    return ''
  }
  if (!platform.offline) return url
  const key = keyOf(url)
  if (!key) return url
  const copy = await objectUrl(key)
  if (copy) {
    void touch(key)
    return copy
  }
  void keepFile(url)
  return url
}

/* Les fichiers ajoutés hors ligne */

/** Garde un fichier ajouté hors ligne jusqu'à son envoi ; renvoie son adresse locale. */
export async function storeLocalFile(id: string, file: Blob): Promise<string> {
  await putFile(`local/${id}`, file, { size: file.size, type: file.type, usedAt: Date.now() })
  return `${LOCAL_FILE}${id}`
}

/** Le contenu d'un fichier ajouté hors ligne, au moment de l'envoyer. */
export const localFile = (id: string) => getBlob(`local/${id}`)

/**
 * Le fichier ajouté hors ligne est envoyé (ou refusé : ''). Sa copie passe sous sa vraie adresse
 * (comme un fichier envoyé en ligne) et l'adresse locale mène désormais à la vraie.
 */
export async function settleLocalFile(id: string, realUrl: string): Promise<void> {
  const localKey = `local/${id}`
  replaced.set(`${LOCAL_FILE}${id}`, realUrl)
  await writeKey(REPLACED_KEY, Object.fromEntries(replaced))
  const blob = await getBlob(localKey)
  const key = realUrl ? keyOf(realUrl) : null
  if (blob && key && blob.size <= MAX_FILE_BYTES) {
    await putFile(key, blob, { size: blob.size, type: blob.type, usedAt: Date.now() })
    const shown = objectUrls.get(localKey)
    if (shown && !objectUrls.has(key)) objectUrls.set(key, shown)
  }
  await deleteFile(localKey, true)
  await evictFiles()
}

/** Se déconnecter : les fichiers gardés disparaissent aussi. */
export async function clearFiles(): Promise<void> {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
  replaced.clear()
  inFlight.clear()
  failed.clear()
  memory.blobs.clear()
  memory.meta.clear()
  await request('blobs', 'readwrite', (s) => s.clear())
  await request('meta', 'readwrite', (s) => s.clear())
}

/** Pour les tests : ce que contient le stockage. */
export const storedFiles = async () => Object.fromEntries(await allMeta())
