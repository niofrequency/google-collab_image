import { cloudForget } from './cloud.js'

// Removes exact duplicates (byte-for-byte the same file) from one gallery. Each item's SHA-256 fingerprint is saved
// on it ("hash"), so only new items are read the next time. Kept: the copy already in cloud backup, then the one
// with the most details saved, then the oldest; the folders of all copies are merged onto it.
// Only identical files count — pictures that merely look alike are never touched.

async function sha256(blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

function openExisting(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => req.transaction.abort()   // never create a gallery here
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

const detailScore = r => Object.keys(r).filter(k => r[k] !== null && r[k] !== '' && r[k] !== undefined).length

// source: { db, store, key }; cloudKind: 'images' | 'videos' | null. Returns how many were removed.
export async function removeDuplicates(source, cloudKind = null) {
  if (!globalThis.crypto?.subtle) return 0
  let db
  try { db = await openExisting(source.db) } catch { return 0 }
  if (!db.objectStoreNames.contains(source.store)) { db.close(); return 0 }
  const records = await new Promise(resolve => {
    const q = db.transaction(source.store, 'readonly').objectStore(source.store).getAll()
    q.onsuccess = () => resolve(q.result || [])
    q.onerror = () => resolve([])
  })
  // fingerprints for items that don't have one yet (saved, so this happens once per item)
  const fresh = []
  for (const r of records) {
    if (r.blob && !r.hash) {
      try { r.hash = await sha256(r.blob); fresh.push(r) } catch { /* unreadable blob: skip */ }
    }
  }
  const groups = new Map()
  for (const r of records) if (r.hash) (groups.get(r.hash) || groups.set(r.hash, []).get(r.hash)).push(r)
  const remove = [], update = [...fresh]
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => (!!b.cloudId - !!a.cloudId) || (detailScore(b) - detailScore(a)) || ((a.created || 0) - (b.created || 0)))
    const [keep, ...dups] = list
    const folders = [...new Set(list.flatMap(r => r.folders || []))]
    if (folders.length !== (keep.folders || []).length) {
      keep.folders = folders
      keep.foldersAt = Date.now()
      if (!update.includes(keep)) update.push(keep)
    }
    remove.push(...dups)
  }
  if (remove.length && cloudKind) {
    try { await cloudForget(cloudKind, remove.map(r => r.id)) } catch { /* cloud off or offline: local removal still happens */ }
  }
  if (update.length || remove.length) {
    const removing = new Set(remove.map(r => r.id))
    await new Promise(resolve => {
      const tx = db.transaction(source.store, 'readwrite')
      const store = tx.objectStore(source.store)
      for (const r of update) if (!removing.has(r.id)) store.put(r)
      for (const r of remove) store.delete(r.id)
      tx.oncomplete = resolve
      tx.onerror = resolve
    })
  }
  db.close()
  return remove.length
}
