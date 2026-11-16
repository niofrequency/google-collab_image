// Saved characters, shared by every tab. Stored in localStorage 'face_characters' (backed up to the cloud).
// A character: { name, images: [primary, extra1?, extra2?], strength?, notes?, createdAt? }
// images[0] is the Primary picture (a clear, front-facing face); images[1..2] are Extra angles / expressions.
// This is the same format the Image Generator's Face reference has always saved, so old characters keep working.
import { useEffect, useState } from 'react'

export const CHAR_KEY = 'face_characters'
export const MAX_CHARACTER_IMAGES = 3

export function loadCharacters() {
  try {
    const list = JSON.parse(localStorage.getItem(CHAR_KEY)) || []
    return list.filter(c => c && c.name).map(c => ({ ...c, images: (c.images || []).filter(Boolean).slice(0, MAX_CHARACTER_IMAGES) }))
  } catch { return [] }
}

// Returns false (and leaves the old list) when the browser's storage is full
export function saveCharacters(list) {
  try {
    localStorage.setItem(CHAR_KEY, JSON.stringify(list))
  } catch {
    return false
  }
  window.dispatchEvent(new Event('characters-changed'))
  return true
}

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
  else if (images.length === 0) images.push(image)      // a new character's first picture is its Primary
  else images[Math.min(slot, images.length)] = image
  c.images = images.filter(Boolean).slice(0, MAX_CHARACTER_IMAGES)
  return saveCharacters(list) ? '' : 'Browser storage is full — delete a character or some pictures first'
}
