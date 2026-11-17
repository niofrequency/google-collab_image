// Firebase cloud backup: sign in with Google, then the image / video / music galleries, saved characters,
// prompts and presets are copied to your Firebase project (Storage for files, Firestore for details), and
// training datasets can be saved / restored from the LoRA Training tab.
//
// Everything stays in this browser too (IndexedDB / localStorage) — the cloud copy is a backup that syncs
// between your devices. Files go to users/<your uid>/... and the security rules in firestore.rules /
// storage.rules let only you read or write them.
//
// Config: Vercel environment variables VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
// VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_APP_ID — or paste the firebaseConfig
// from the Firebase console into the ☁ panel (kept in this browser).

const ENV_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
}
const CONFIG_KEY = 'firebase_config'

// Galleries kept in IndexedDB by the tabs (same names and versions as the tabs use)
export const KINDS = {
  images: { db: 'ImageGallery', store: 'images', ext: 'png', type: 'image/png', label: 'images', one: 'image' },
  videos: { db: 'VideoGallery', store: 'videos', ext: 'mp4', type: 'video/mp4', label: 'videos', one: 'video' },
  songs: { db: 'MusicGallery', store: 'songs', ext: 'mp3', type: 'audio/mpeg', label: 'songs', one: 'song' },
}
// localStorage keys synced as one settings file (lists of {name, ...} are merged by name)
const SETTINGS_KEYS = k => k === 'face_characters' || k === 'prompts' || k.startsWith('presets_custom_') ||
  k === 'headswap_prompts' || k === 'faceswap_prompts'

// ---------------------------------------------------------------- config
export function parseConfig(text) {
  // Accepts JSON or the "const firebaseConfig = { apiKey: "...", ... }" snippet from the console
  const out = {}
  for (const m of String(text || '').matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g)) out[m[1]] = m[2]
  return out.apiKey && out.projectId ? out : null
}
export function getConfig() {
  if (ENV_CONFIG.apiKey && ENV_CONFIG.projectId) return { ...ENV_CONFIG, source: 'env' }
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY))
    if (c?.apiKey && c?.projectId) return { ...c, source: 'browser' }
  } catch { /* none */ }
  return null
}
export function saveConfig(config) {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  else localStorage.removeItem(CONFIG_KEY)
}
export const cloudConfigured = () => !!getConfig()

// ---------------------------------------------------------------- Firebase (loaded only when configured)
let fb = null
async function firebase() {
  if (fb) return fb
  const config = getConfig()
  if (!config) throw new Error('Cloud backup is not set up — open ☁ and paste your Firebase config')
  const { source, ...cfg } = config
  const [appMod, authMod, fsMod, stMod] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/storage'),
  ])
  const app = appMod.initializeApp(cfg)
  const storage = stMod.getStorage(app)
  // Give up on a download after 30 s instead of 2 min (it keeps retrying when the bucket's CORS blocks this
  // site, which never fixes itself). Uploads keep 10 min, so big videos still go up on slow phone connections.
  storage.maxOperationRetryTime = 30 * 1000
  fb = {
    auth: authMod.getAuth(app), authMod,
    db: fsMod.getFirestore(app), fs: fsMod,
    storage, st: stMod,
  }
  return fb
}

let currentUser = null
const userListeners = new Set()
export function onUserChange(cb) {
  userListeners.add(cb)
  cb(currentUser)
  return () => userListeners.delete(cb)
}
export const getUser = () => currentUser

export async function initCloud() {
  if (!cloudConfigured()) return
  const { auth, authMod } = await firebase()
  authMod.onAuthStateChanged(auth, user => {
    const signedIn = user && (!currentUser || currentUser.uid !== user.uid)
    currentUser = user ? { uid: user.uid, name: user.displayName || user.email || 'you', email: user.email, photo: user.photoURL } : null
    userListeners.forEach(cb => cb(currentUser))
    if (signedIn) syncEverything().catch(e => setStatus({ state: 'error', text: friendly(e) }))
  })
}

export async function signIn() {
  const { auth, authMod } = await firebase()
  await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider())
}
export async function signOutCloud() {
  const { auth, authMod } = await firebase()
  await authMod.signOut(auth)
}

// ---------------------------------------------------------------- status (shown in the ☁ bar)
let status = { state: 'idle', text: '' }
const statusListeners = new Set()
export function onStatus(cb) { statusListeners.add(cb); cb(status); return () => statusListeners.delete(cb) }
function setStatus(s) { status = { ...s, at: Date.now() }; statusListeners.forEach(cb => cb(status)) }

// ---------------------------------------------------------------- IndexedDB helpers
function openStore(kind) {
  const k = KINDS[kind]
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(k.db, 1)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(k.store)) db.createObjectStore(k.store, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
  })
}
function idb(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
  })
}

// Details saved next to each file: everything except the file itself, local-only fields and big inline pictures
function metaOf(rec) {
  const out = {}
  for (const [k, v] of Object.entries(rec)) {
    if (['blob', 'id', 'url', 'src', 'cloudId', 'cloudUid'].includes(k)) continue
    if (typeof v === 'string' && v.length > 50000) continue   // e.g. a video's last frame (re-made from the video)
    if (v === undefined) continue
    out[k] = v
  }
  return JSON.parse(JSON.stringify(out))   // Firestore rejects undefined anywhere
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ---------------------------------------------------------------- gallery sync
const running = {}
let queued = {}

// Two-way sync of one gallery: upload what's only here, download what's only in the cloud,
// and remove here what was deleted on another device.
export async function syncKind(kind) {
  if (!currentUser) return { up: 0, down: 0, removed: 0 }
  if (running[kind]) { queued[kind] = true; return running[kind] }
  running[kind] = (async () => {
    const { db: fdb, fs, storage, st } = await firebase()
    const uid = currentUser.uid
    const k = KINDS[kind]
    const col = fs.collection(fdb, 'users', uid, kind)
    const snap = await fs.getDocs(col)
    const cloud = new Map(snap.docs.map(d => [d.id, d.data()]))
    const local = await openStore(kind)
    const records = await idb(local, k.store, 'readonly', s => s.getAll())
    const known = new Set()
    let up = 0, down = 0, removed = 0, failed = 0, lastError = null
    for (const rec of records) {
      if (rec.cloudId && rec.cloudUid && rec.cloudUid !== uid) continue   // backed up to a different account: leave it
      if (rec.cloudId && rec.cloudUid === uid) {
        known.add(rec.cloudId)
        const c = cloud.get(rec.cloudId)
        if (!c) {   // deleted on another device
          await idb(local, k.store, 'readwrite', s => s.delete(rec.id))
          removed++
        } else if ((rec.foldersAt || 0) !== (c.foldersAt || 0)) {
          // folders (gallery folders) changed on one side since the last sync: the newer change wins
          try {
            if ((rec.foldersAt || 0) > (c.foldersAt || 0)) {
              await fs.updateDoc(fs.doc(col, rec.cloudId), { folders: rec.folders || [], foldersAt: rec.foldersAt })
            } else {
              await idb(local, k.store, 'readwrite', s => s.put({ ...rec, folders: c.folders || [], foldersAt: c.foldersAt }))
              down++
            }
          } catch (e) { failed++; lastError = e; console.warn('Folder sync failed', e) }
        }
        continue
      }
      if (!rec.blob) continue
      setStatus({ state: 'busy', text: `Backing up ${k.label}... ${up + 1}` })
      try {   // one file that fails doesn't stop the others
        const id = newId()
        const path = `users/${uid}/${kind}/${id}.${k.ext}`
        const type = (rec.blob.type || '').split('/')[0] === k.type.split('/')[0] ? rec.blob.type : k.type  // the rules check the type
        await st.uploadBytes(st.ref(storage, path), rec.blob, { contentType: type })
        await fs.setDoc(fs.doc(col, id), { ...metaOf(rec), path, size: rec.blob.size, created: rec.created || Date.now() })
        await idb(local, k.store, 'readwrite', s => s.put({ ...rec, cloudId: id, cloudUid: uid }))
        known.add(id)
        up++
      } catch (e) { failed++; lastError = e; console.warn(`Backup of a ${k.one} failed`, e) }
    }
    for (const [id, data] of cloud) {
      if (known.has(id)) continue
      setStatus({ state: 'busy', text: `Downloading ${k.label}... ${down + 1}` })
      try {
        const blob = await st.getBlob(st.ref(storage, data.path))
        const { path, size, ...meta } = data
        await idb(local, k.store, 'readwrite', s => s.add({ ...meta, blob, cloudId: id, cloudUid: uid }))
        down++
      } catch (e) {
        failed++; lastError = e; console.warn(`Download of a ${k.one} failed`, e)
        // Every download fails the same way when the bucket blocks this site: stop instead of waiting on each one
        if (e?.code === 'storage/retry-limit-exceeded' || e?.code === 'storage/unknown') break
      }
    }
    if (up || down || removed) window.dispatchEvent(new CustomEvent('cloud-synced', { detail: { kind, up, down, removed } }))
    return { up, down, removed, failed, lastError }
  })()
  try {
    return await running[kind]
  } finally {
    running[kind] = null
    if (queued[kind]) { queued[kind] = false; syncKind(kind).catch(() => {}) }
  }
}

// Called by the tabs after saving something new (waits a moment so a batch is uploaded together)
const timers = {}
export function queueSync(kind) {
  if (!currentUser) return
  clearTimeout(timers[kind])
  timers[kind] = setTimeout(async () => {
    try {
      const r = await syncKind(kind)
      if (r.failed) setStatus({ state: 'error', text: `${r.failed} ${r.failed === 1 ? KINDS[kind].one : KINDS[kind].label} could not be synced: ${friendly(r.lastError)}` })
      else setStatus({ state: 'ok', text: r.up ? `Backed up ${r.up} ${r.up === 1 ? KINDS[kind].one : KINDS[kind].label}` : 'Synced' })
    } catch (e) { setStatus({ state: 'error', text: `Backup failed: ${friendly(e)}` }) }
  }, 2500)
}

// Called by the tabs before deleting from the gallery: removes the cloud copies too
export async function cloudForget(kind, localIds) {
  if (!currentUser || !localIds?.length) return
  try {
    const { db: fdb, fs, storage, st } = await firebase()
    const local = await openStore(kind)
    for (const id of localIds) {
      const rec = await idb(local, KINDS[kind].store, 'readonly', s => s.get(id))
      if (!rec?.cloudId || rec.cloudUid !== currentUser.uid) continue
      const ref = fs.doc(fdb, 'users', currentUser.uid, kind, rec.cloudId)
      const snap = await fs.getDoc(ref)
      if (snap.exists()) {
        await st.deleteObject(st.ref(storage, snap.data().path)).catch(() => {})
        await fs.deleteDoc(ref)
      }
    }
  } catch (e) { setStatus({ state: 'error', text: `Could not delete the cloud copy: ${e.message}` }) }
}

// ---------------------------------------------------------------- settings (characters, prompts, presets)
// One file, users/<uid>/settings.json. Every sync reads the cloud copy first and merges it with this browser's
// (it used to only merge at sign-in and then overwrite the cloud copy every 20 s — so a computer without your
// characters could wipe them from the cloud). Lists ({name, ...} items) are merged item by item:
//   - added on either computer -> kept on both
//   - changed on one computer  -> the newest change wins
//   - deleted on one computer  -> deleted on both (remembered as "deleted at <time>", so it doesn't come back)
const SYNC_STATE = 'settings_sync_state'   // { key: { name: { t, del } } }: when each item was last changed / deleted
const SYNC_PREV = 'settings_sync_prev'     // { key: { name: hash } }: what this browser had at the last sync

function localSettings() {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (SETTINGS_KEYS(key)) { try { out[key] = JSON.parse(localStorage.getItem(key)) } catch { /* skip */ } }
  }
  return out
}
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback } }
function hashOf(value) {   // a quick fingerprint of one item (FNV-1a over its JSON)
  const str = JSON.stringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36) + ':' + str.length
}
const isList = v => Array.isArray(v) && v.every(x => x && typeof x === 'object' && typeof x.name === 'string')
// Each item's identity. Characters: the name (one character per name, so an edit replaces it on every computer).
// Prompts and presets: name + content — two different "Untitled" prompts are two prompts (an edit = delete + add).
function idsOf(list, key) {
  const seen = {}
  return (list || []).map(x => {
    const base = key === 'face_characters' ? x.name : `${x.name}|${hashOf(x)}`
    seen[base] = (seen[base] || 0) + 1
    return seen[base] > 1 ? `${base} #${seen[base]}` : base
  })
}
// The same content in any order (each computer keeps its own order, so order alone never causes an upload)
function canonical(settings, state) {
  const out = {}
  for (const key of Object.keys(settings).sort()) {
    const v = settings[key]
    out[key] = isList(v) ? v.map(hashOf).sort() : v
  }
  const st = {}
  for (const key of Object.keys(state || {}).sort()) {
    st[key] = Object.keys(state[key]).sort().map(n => [n, state[key][n].t, !!state[key][n].del])
  }
  return JSON.stringify([out, st])
}
const later = (a, b) => (!a ? b : !b ? a : (b.t > a.t ? b : a))

// What changed in this browser since the last sync: new / edited items get "changed now", missing ones "deleted now"
function noteLocalChanges(local, state, prev) {
  const now = Date.now()
  for (const key of new Set([...Object.keys(local), ...Object.keys(prev)])) {
    const list = local[key]
    if (list !== undefined && !isList(list)) continue
    const before = prev[key] || {}
    const items = {}
    const ids = idsOf(list, key)
    for (const [i, item] of (list || []).entries()) items[ids[i]] = hashOf(item)
    state[key] = state[key] || {}
    for (const [name, h] of Object.entries(items)) {
      if (before[name] !== h || state[key][name]?.del) state[key][name] = { t: now, del: false }
    }
    for (const name of Object.keys(before)) if (!(name in items)) state[key][name] = { t: now, del: true }
  }
}

function mergeSettings(local, localState, cloud, cloudState) {
  const merged = {}, state = {}
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const L = local[key], C = cloud[key]
    if (!isList(L ?? []) || !isList(C ?? [])) { merged[key] = L ?? C; continue }   // not a list: this browser's wins
    const ls = localState[key] || {}, cs = cloudState[key] || {}
    state[key] = {}
    for (const name of new Set([...Object.keys(ls), ...Object.keys(cs)])) state[key][name] = later(ls[name], cs[name])
    const byName = new Map()
    const lIds = idsOf(L, key), cIds = idsOf(C, key)
    for (const [i, item] of (C || []).entries()) byName.set(cIds[i], { item, from: 'cloud' })
    for (const [i, item] of (L || []).entries()) {
      const id = lIds[i]
      // both have it: take the side whose last change is newer (this browser's on a tie)
      if (!byName.has(id) || !((cs[id]?.t || 0) > (ls[id]?.t || 0))) byName.set(id, { item, from: 'local' })
    }
    // keep this browser's order, then what's new from the cloud; drop deleted items
    const order = [...lIds, ...cIds]
    const seen = new Set()
    merged[key] = order.filter(n => !seen.has(n) && seen.add(n) && !state[key][n]?.del).map(n => byName.get(n).item)
  }
  return { merged, state }
}

let lastCloudMd5 = null
let lastLocalJson = null
let settingsBusy = null

export function syncSettings() {   // one at a time (the 20 s timer and "Sync now" can overlap)
  if (!currentUser) return Promise.resolve()
  if (!settingsBusy) settingsBusy = runSettingsSync().finally(() => { settingsBusy = null })
  return settingsBusy
}
async function runSettingsSync() {
  const { storage, st } = await firebase()
  const ref = st.ref(storage, `users/${currentUser.uid}/settings.json`)
  const local = localSettings()
  const localJson = JSON.stringify(local)
  // nothing changed here or in the cloud since the last sync: nothing to do (only the small metadata is read)
  let md5 = null
  try { md5 = (await st.getMetadata(ref)).md5Hash || null } catch (e) { if (e?.code !== 'storage/object-not-found') throw e }
  if (localJson === lastLocalJson && md5 === lastCloudMd5) return

  const state = readJson(SYNC_STATE, {})
  noteLocalChanges(local, state, readJson(SYNC_PREV, {}))
  let cloud = {}, cloudState = {}
  if (md5) {
    const data = JSON.parse(await (await st.getBlob(ref)).text())
    cloudState = data.__sync_state || {}
    delete data.__sync_state
    cloud = data
  }
  const { merged, state: newState } = mergeSettings(local, state, cloud, cloudState)
  // keep "deleted" notes for 90 days, so a computer that was off for a while still deletes them
  const old = Date.now() - 90 * 24 * 3600 * 1000
  for (const key of Object.keys(newState)) for (const [n, v] of Object.entries(newState[key])) if (v.del && v.t < old) delete newState[key][n]

  let changedHere = false
  const kept = {}   // what this browser really has now
  for (const [key, value] of Object.entries(merged)) {
    kept[key] = value
    if (canonical({ k: value }) !== canonical({ k: local[key] })) {
      try { localStorage.setItem(key, JSON.stringify(value)); changedHere = true } catch {
        kept[key] = local[key]   // browser storage full: the old list stays (what's missing is NOT treated as deleted)
      }
    }
  }
  const prev = {}
  for (const [key, value] of Object.entries(kept)) {
    if (isList(value)) { const ids = idsOf(value, key); prev[key] = Object.fromEntries(value.map((x, i) => [ids[i], hashOf(x)])) }
  }
  localStorage.setItem(SYNC_STATE, JSON.stringify(newState))
  localStorage.setItem(SYNC_PREV, JSON.stringify(prev))
  if (changedHere) {
    window.dispatchEvent(new CustomEvent('cloud-settings'))
    window.dispatchEvent(new Event('characters-changed'))
  }

  const out = JSON.stringify({ ...merged, __sync_state: newState })
  if (!md5 || canonical(merged, newState) !== canonical(cloud, cloudState)) {
    await st.uploadBytes(ref, new Blob([out], { type: 'application/json' }), { contentType: 'application/json' })
    try { md5 = (await st.getMetadata(ref)).md5Hash || null } catch { md5 = null }
  }
  lastCloudMd5 = md5
  lastLocalJson = JSON.stringify(localSettings())
}
// Changes on this computer or another one are picked up every 20 s while signed in
setInterval(() => { if (currentUser) syncSettings().catch(() => {}) }, 20000)

export async function syncEverything() {
  setStatus({ state: 'busy', text: 'Syncing...' })
  try {
    const totals = { up: 0, down: 0, removed: 0, failed: 0 }
    let lastError = null
    // Settings first, but a failure there doesn't stop the pictures, videos and songs
    try { await syncSettings() } catch (e) { totals.failed++; lastError = e; console.warn('Settings sync failed', e) }
    for (const kind of Object.keys(KINDS)) {
      const r = await syncKind(kind)
      totals.up += r.up; totals.down += r.down; totals.removed += r.removed; totals.failed += r.failed
      if (r.lastError) lastError = r.lastError
    }
    if (totals.failed) {
      setStatus({ state: 'error', text: `Synced ${totals.up} up, ${totals.down} down — ${totals.failed} failed: ${friendly(lastError)}` })
    } else {
      setStatus({ state: 'ok', text: `Synced — ${totals.up} uploaded, ${totals.down} downloaded` })
    }
    return totals
  } catch (e) {
    setStatus({ state: 'error', text: friendly(e) })
    throw e
  }
}

export function friendly(e) {
  const code = e?.code || ''
  if (code.includes('permission-denied') || code.includes('unauthorized')) {
    return 'Permission denied — publish the security rules from the README (Firestore and Storage)'
  }
  if (code === 'storage/retry-limit-exceeded') {
    return `Firebase Storage didn't answer. Usually the bucket's CORS settings don't allow this site (${location.origin}): ` +
      'run the CORS step from the README again (cors.json now allows any site). If it still happens, check your connection, ' +
      'and that the Storage bucket in your Firebase config matches the one on the Firebase Storage page.'
  }
  if (code === 'storage/unknown' || code.includes('bucket')) return 'Storage is not set up — create the Storage bucket in Firebase (needs the Blaze plan)'
  if (code === 'auth/unauthorized-domain') return 'Add this site\'s domain under Firebase → Authentication → Settings → Authorized domains'
  if (code === 'auth/popup-closed-by-user') return 'Sign-in was cancelled'
  return e?.message || String(e)
}

// ---------------------------------------------------------------- training datasets
// Firestore users/<uid>/training/<name>: { images: [{ file, caption, path, size }], settings, trigger, updated }
// Storage users/<uid>/training/<name>/<file>
export async function listCloudDatasets() {
  const { db: fdb, fs } = await firebase()
  const snap = await fs.getDocs(fs.collection(fdb, 'users', currentUser.uid, 'training'))
  return snap.docs.map(d => ({ name: d.id, images: (d.data().images || []).length, updated: d.data().updated }))
}

// images: [{ file, caption }]; getFile(file) -> Blob of the full image
export async function saveDatasetToCloud(name, images, getFile, extra, onProgress) {
  const { db: fdb, fs, storage, st } = await firebase()
  const uid = currentUser.uid
  const ref = fs.doc(fdb, 'users', uid, 'training', name)
  const snap = await fs.getDoc(ref)
  const before = new Map(((snap.exists() && snap.data().images) || []).map(x => [x.file, x]))
  const after = []
  let uploaded = 0
  for (let i = 0; i < images.length; i++) {
    const { file, caption } = images[i]
    onProgress?.(i, images.length)
    let entry = before.get(file)
    if (!entry) {
      const blob = await getFile(file)
      const path = `users/${uid}/training/${name}/${file}`
      await st.uploadBytes(st.ref(storage, path), blob, { contentType: (blob.type || '').startsWith('image/') ? blob.type : 'image/jpeg' })
      entry = { file, path, size: blob.size }
      uploaded++
    }
    after.push({ ...entry, caption: caption || '' })
  }
  const keep = new Set(after.map(x => x.file))
  let removed = 0
  for (const [file, entry] of before) {
    if (!keep.has(file)) { await st.deleteObject(st.ref(storage, entry.path)).catch(() => {}); removed++ }
  }
  await fs.setDoc(ref, JSON.parse(JSON.stringify({ images: after, ...extra, updated: Date.now() })))
  return { uploaded, removed, total: after.length }
}

export async function loadDatasetFromCloud(name) {
  const { db: fdb, fs } = await firebase()
  const snap = await fs.getDoc(fs.doc(fdb, 'users', currentUser.uid, 'training', name))
  if (!snap.exists()) throw new Error(`No cloud copy of "${name}"`)
  return snap.data()
}
export async function cloudFile(path) {
  const { storage, st } = await firebase()
  return st.getBlob(st.ref(storage, path))
}
