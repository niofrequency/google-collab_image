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
        if (!cloud.has(rec.cloudId)) {   // deleted on another device
          await idb(local, k.store, 'readwrite', s => s.delete(rec.id))
          removed++
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
function localSettings() {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (SETTINGS_KEYS(key)) { try { out[key] = JSON.parse(localStorage.getItem(key)) } catch { /* skip */ } }
  }
  return out
}
function mergeLists(local, cloud) {
  if (!Array.isArray(local) || !Array.isArray(cloud)) return local ?? cloud
  const names = new Set(local.map(x => x?.name))
  return [...local, ...cloud.filter(x => !names.has(x?.name))]
}
let lastSettingsJson = ''

export async function syncSettings({ merge = false } = {}) {
  if (!currentUser) return
  const { storage, st } = await firebase()
  const ref = st.ref(storage, `users/${currentUser.uid}/settings.json`)
  let settings = localSettings()
  if (merge) {   // on sign-in: bring in what the cloud has (e.g. characters saved on another device)
    try {
      const cloud = JSON.parse(await (await st.getBlob(ref)).text())
      for (const [key, value] of Object.entries(cloud)) {
        const merged = mergeLists(settings[key], value)
        if (JSON.stringify(merged) !== JSON.stringify(settings[key])) {
          localStorage.setItem(key, JSON.stringify(merged))
          settings[key] = merged
        }
      }
      window.dispatchEvent(new CustomEvent('cloud-settings'))
    } catch (e) {
      if (e?.code !== 'storage/object-not-found') throw e
    }
  }
  const json = JSON.stringify(settings)
  if (json === lastSettingsJson) return
  await st.uploadBytes(ref, new Blob([json], { type: 'application/json' }), { contentType: 'application/json' })
  lastSettingsJson = json
}
// Settings changes are picked up every 20 s while signed in
setInterval(() => { if (currentUser) syncSettings().catch(() => {}) }, 20000)

export async function syncEverything() {
  setStatus({ state: 'busy', text: 'Syncing...' })
  try {
    const totals = { up: 0, down: 0, removed: 0, failed: 0 }
    let lastError = null
    // Settings first, but a failure there doesn't stop the pictures, videos and songs
    try { await syncSettings({ merge: true }) } catch (e) { totals.failed++; lastError = e; console.warn('Settings sync failed', e) }
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
