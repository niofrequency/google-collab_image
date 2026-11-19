// Saved characters, shared by every tab.
// The list (names, tags, picture ids) is in localStorage 'face_characters' and backed up to Firebase.
// The picture bytes are NOT in localStorage — they are in IndexedDB and uploaded to Firebase Storage.
// A character: { name, imageIds, images (filled in memory), emotions: [{ id, tag }], strength?, notes? }
import { useEffect, useState } from 'react'
import { cachedPicture, rememberPicture, hydratePictures } from './pictureCache.js'

export const CHAR_KEY = 'face_characters'
export const MAX_CHARACTER_IMAGES = 5

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function emotionList(raw) {
  if (Array.isArray(raw)) return raw.filter(s => s && (s.id || s.image))
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([, image]) => typeof image === 'string' && image.startsWith('data:'))
      .map(([tag, image]) => ({ id: newId(), tag, image }))
  }
  return []
}

// Strip picture bytes out of a character list. Bytes are remembered for IndexedDB + Firebase.
export function packForStorage(list) {
  return (list || []).filter(c => c && c.name).map(c => {
    const existing = c.imageIds || []
    const srcs = (c.images || []).filter(src => typeof src === 'string' && src.startsWith('data:'))
    let imageIds = existing
    if (srcs.length) {
      imageIds = srcs.slice(0, MAX_CHARACTER_IMAGES).map((src, i) => {
        const reuse = existing[i] && cachedPicture(existing[i]) === src ? existing[i] : ''
        const id = reuse || newId()
        if (!reuse) rememberPicture(id, src, 'charpic')
        return id
      })
    }
    const emotions = emotionList(c.emotions).map(s => {
      const id = s.id || newId()
      if (typeof s.image === 'string' && s.image.startsWith('data:')) rememberPicture(id, s.image, 'emotion')
      return { id, tag: s.tag || '' }
    })
    const out = { ...c, imageIds, emotions }
    delete out.images
    return out
  })
}

export function loadCharacters() {
  try {
    const list = JSON.parse(localStorage.getItem(CHAR_KEY)) || []
    return list.filter(c => c && c.name).map(c => {
      const fromIds = (c.imageIds || []).map(id => cachedPicture(id)).filter(Boolean)
      const legacy = (!c.imageIds && Array.isArray(c.images))
        ? c.images.filter(src => typeof src === 'string' && src.startsWith('data:'))
        : []
      return { ...c, images: (fromIds.length ? fromIds : legacy).slice(0, MAX_CHARACTER_IMAGES) }
    })
  } catch { return [] }
}

// Returns false (and leaves the old list) when the browser's storage is full
export function saveCharacters(list) {
  const packed = packForStorage(list)
  try {
    localStorage.setItem(CHAR_KEY, JSON.stringify(packed))
  } catch {
    return false
  }
  window.dispatchEvent(new Event('characters-changed'))
  window.dispatchEvent(new Event('pictures-dirty'))
  return true
}

// Move picture bytes out of localStorage once, after IndexedDB has its cache.
export function migrateCharacterPictures() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAR_KEY)) || []
    const fat = raw.some(c =>
      (c.images || []).some(src => typeof src === 'string' && src.startsWith('data:')) ||
      (Array.isArray(c.emotions) && c.emotions.some(s => typeof s?.image === 'string')) ||
      (c.emotions && !Array.isArray(c.emotions) && typeof c.emotions === 'object'))
    if (fat) saveCharacters(raw)
  } catch { /* nothing stored */ }
}

hydratePictures().then(() => {
  migrateCharacterPictures()
  window.dispatchEvent(new Event('characters-changed'))
})

// The character list, kept up to date when another tab, the Characters tab or the cloud backup changes it
export function useCharacters() {
  const [list, setList] = useState(loadCharacters)
  useEffect(() => {
    const reload = () => setList(loadCharacters())
    window.addEventListener('characters-changed', reload)
    window.addEventListener('cloud-settings', reload)
    return () => {
      window.removeEventListener('characters-changed', reload)
      window.removeEventListener('cloud-settings', reload)
    }
  }, [])
  return list
}

// Adds a picture to a character: slot 0 = Primary (the old primary moves to the extras), 1 / 2 = Extra 1 / 2.
// Creates the character if the name is new. Returns an error message or ''.
export function putCharacterImage(name, image, slot) {
  const list = loadCharacters()
  let c = list.find(x => x.name === name)
  if (!c) {
    c = { name, images: [], strength: 0.8, notes: '', createdAt: Date.now() }
    list.push(c)
  }
  const images = [...c.images]
  if (slot === 0) images.unshift(image)
  else if (images.length === 0) images.push(image)
  else images[Math.min(slot, images.length)] = image
  c.images = images.filter(Boolean).slice(0, MAX_CHARACTER_IMAGES)
  return saveCharacters(list) ? '' : 'Browser storage is full — delete a character or some pictures first'
}
