// Emotion shots for a character. Stored as emotions: [{ id, image, tag }].
// tag is the emotion only (LoRA-style), never the full WD14 caption.
import { loadCharacters, saveCharacters } from './characters.js'
import { cachedPicture, ensurePicture } from './pictureCache.js'

// Expression tags the training tagger is allowed to keep. Everything else
// (hair, clothes, body, background) is dropped.
const EXPRESSION = new Set([
  'smile', 'grin', 'smirk', 'smug', 'laughing', 'giggle', 'happy', 'sad',
  'crying', 'tears', 'streaming_tears', 'tearing_up', 'sobbing',
  'angry', 'anger_vein', 'annoyed', 'frown', 'scowl', 'rage',
  'surprised', 'shocked', 'scared', 'frightened', 'screaming', 'shouting',
  'disgust', 'disgusted',
  'blush', 'embarrassed', 'shy', 'nervous',
  'ahegao', 'orgasm', 'torogao', 'naughty_face', 'seductive_smile', 'lustful',
  'tongue_out', 'tongue', 'lip_biting', 'biting_lip',
  'panting', 'heavy_breathing', 'moaning',
  'expressionless', 'empty_eyes', 'blank_eyes', 'vacant',
  'pout', 'wince', 'pain', 'pleading', 'desperate', 'overwhelmed',
  'dominant', 'teasing', 'playful', 'bliss',
])

function wordAt(text, word) {
  let from = 0
  const t = text.toLowerCase()
  const w = word.toLowerCase()
  while (from <= t.length) {
    const i = t.indexOf(w, from)
    if (i < 0) return -1
    const before = i === 0 || /[^a-z0-9]/.test(t[i - 1])
    const after = i + w.length >= t.length || /[^a-z0-9]/.test(t[i + w.length])
    if (before && after) return i
    from = i + w.length
  }
  return -1
}

function splitTags(caption) {
  return String(caption || '').toLowerCase().split(/[,]+/).map(t => t.trim().replace(/\s+/g, '_')).filter(Boolean)
}

// Emotion tags only, in the order the tagger returned them. '' when there are none.
export function emotionOnly(caption) {
  const kept = []
  for (const tag of splitTags(caption)) {
    const hit = EXPRESSION.has(tag) ? tag
      : [...EXPRESSION].find(e => tag === e || tag.endsWith('_' + e) || tag.startsWith(e + '_'))
    if (hit && !kept.includes(hit)) kept.push(hit)
  }
  if (kept.length) return kept.slice(0, 4).join(', ')
  // Sentence captions (Qwen trainer): keep an expression word if one is written out.
  const words = []
  const text = String(caption || '').replace(/_/g, ' ')
  for (const e of EXPRESSION) {
    const shown = e.replace(/_/g, ' ')
    if (wordAt(text, shown) >= 0 && !words.includes(e)) words.push(e)
  }
  return words.slice(0, 4).join(', ')
}

export function emotionShots(character) {
  const raw = character?.emotions
  const list = Array.isArray(raw) ? raw.filter(s => s && s.id) : []
  return list.map(s => ({ id: s.id, tag: s.tag || '', image: cachedPicture(s.id) || (typeof s.image === 'string' ? s.image : '') }))
}

export function saveEmotionShots(name, shots) {
  const list = loadCharacters()
  const c = list.find(x => x.name === name)
  if (!c) return 'That character is gone — pick another'
  c.emotions = shots
  return saveCharacters(list) ? '' : 'Browser storage is full — delete a character or some pictures first'
}

export function newShotId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Which emotion tag in this character's set the prompt names, or null. Does not load the picture.
export function emotionLabelForPrompt(characterName, prompt) {
  if (!characterName || !prompt) return null
  const character = loadCharacters().find(c => c.name === characterName)
  let best = null
  for (const shot of emotionShots(character)) {
    const parts = String(shot.tag || '').split(/[,\s]+/).map(t => t.replace(/_/g, ' ').trim()).filter(Boolean)
    for (const w of parts) {
      const i = wordAt(prompt, w)
      if (i < 0) continue
      if (!best || i < best.i || (i === best.i && w.length > best.len)) best = { i, len: w.length, shot }
    }
  }
  if (!best) return null
  return { tag: best.shot.tag, label: String(best.shot.tag || '').replace(/_/g, ' ') }
}

// The shot whose emotion tag shows up in the prompt, or null.
export async function emotionForPrompt(characterName, prompt) {
  if (!characterName || !prompt) return null
  const character = loadCharacters().find(c => c.name === characterName)
  let best = null
  for (const shot of emotionShots(character)) {
    const parts = String(shot.tag || '').split(/[,\s]+/).map(t => t.replace(/_/g, ' ').trim()).filter(Boolean)
    for (const w of parts) {
      const i = wordAt(prompt, w)
      if (i < 0) continue
      if (!best || i < best.i || (i === best.i && w.length > best.len)) best = { i, len: w.length, shot }
    }
  }
  if (!best) return null
  const image = await ensurePicture(best.shot.id)
  if (!image) return null
  const label = String(best.shot.tag || '').replace(/_/g, ' ')
  return { image, tag: best.shot.tag, label }
}
