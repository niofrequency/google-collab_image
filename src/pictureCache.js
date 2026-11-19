// Picture bytes live here (IndexedDB), not in localStorage. Firebase gets a copy of each file.
// localStorage only keeps the id.

const DB = 'ArxPictures'
const STORE = 'files'
const mem = new Map()
const dirty = new Set()
let dbp = null

function openDb() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
  })
  return dbp
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function cachedPicture(id) {
  return id ? (mem.get(id) || '') : ''
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl || '').split(',')
  const type = /data:(.*?);/.exec(head)?.[1] || 'image/jpeg'
  const bin = atob(b64 || '')
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// upload: false when the bytes just came from Firebase (don't send them straight back).
export async function rememberPicture(id, dataUrl, kind, upload = true) {
  if (!id || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return
  mem.set(id, dataUrl)
  if (upload) dirty.add(id)
  else dirty.delete(id)
  const db = await openDb()
  const t = db.transaction(STORE, 'readwrite')
  t.objectStore(STORE).put({ id, dataUrl, kind, cloud: !upload })
  await txDone(t)
}

export async function ensurePicture(id) {
  if (!id) return ''
  if (mem.has(id)) return mem.get(id)
  const db = await openDb()
  const rec = await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (rec?.dataUrl) { mem.set(id, rec.dataUrl); return rec.dataUrl }
  return ''
}

export async function hydratePictures() {
  try {
    const db = await openDb()
    const all = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly')
      const req = t.objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    for (const rec of all) if (rec?.id && rec.dataUrl) mem.set(rec.id, rec.dataUrl)
  } catch { /* private mode / blocked storage: pictures stay empty until Firebase */ }
}

export async function markPictureCloud(id) {
  dirty.delete(id)
  const db = await openDb()
  const t = db.transaction(STORE, 'readwrite')
  const store = t.objectStore(STORE)
  const rec = await new Promise(resolve => {
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  if (rec) store.put({ ...rec, cloud: true })
  await txDone(t)
}

// Pictures saved locally that Firebase does not have yet.
export async function picturesToUpload() {
  const db = await openDb()
  const all = await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
  return all.filter(rec => rec?.dataUrl && rec.kind && !rec.cloud)
}

export async function pictureCloudName(kind, id) {
  return `${kind}-${id}.jpg`
}
