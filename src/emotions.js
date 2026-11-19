// Emotion shots for a character. Stored on the character as emotions: { [id]: dataURL }.
// The caption kept for each shot is the emotion tag only (the same idea as a LoRA caption
// that describes what changes, not the whole picture).
import { loadCharacters, saveCharacters } from './characters.js'

export const EMOTIONS = [
  { id: 'crying', tag: 'crying', label: 'Crying', words: ['crying', 'sobbing', 'tearful', 'tears'] },
  { id: 'angry', tag: 'angry', label: 'Angry', words: ['angry', 'anger', 'furious'] },
  { id: 'shocked', tag: 'shocked', label: 'Shocked', words: ['shocked', 'surprised', 'gasp'] },
  { id: 'disgust', tag: 'disgust', label: 'Disgust', words: ['disgust', 'disgusted'] },
  { id: 'lustful', tag: 'lustful', label: 'Lustful', words: ['lustful', 'lust', 'aroused'] },
  { id: 'biting_lip', tag: 'biting_lip', label: 'Biting lip', words: ['biting lip', 'biting lips', 'bite lip', 'lip bite', 'biting_lip'] },
  { id: 'tongue_out', tag: 'tongue_out', label: 'Tongue out', words: ['tongue out', 'tongue_out'] },
  { id: 'ahegao', tag: 'ahegao', label: 'Ahegao', words: ['ahegao'] },
  { id: 'moaning', tag: 'moaning', label: 'Moaning', words: ['moaning', 'moan'] },
  { id: 'orgasm', tag: 'orgasm', label: 'Orgasm', words: ['orgasm', 'climax'] },
  { id: 'pleading', tag: 'pleading', label: 'Pleading', words: ['pleading', 'begging', 'plead'] },
  { id: 'smirk', tag: 'smirk', label: 'Smirk', words: ['smirking', 'smirk'] },
  { id: 'panting', tag: 'panting', label: 'Panting', words: ['panting'] },
  { id: 'overwhelmed', tag: 'overwhelmed', label: 'Overwhelmed', words: ['overwhelmed'] },
  { id: 'dominant', tag: 'dominant', label: 'Dominant', words: ['dominant', 'commanding'] },
  { id: 'bliss', tag: 'bliss', label: 'Bliss', words: ['blissed', 'bliss', 'afterglow'] },
  { id: 'teasing', tag: 'teasing', label: 'Teasing', words: ['teasing', 'playful'] },
  { id: 'desperate', tag: 'desperate', label: 'Desperate', words: ['desperate'] },
  { id: 'shy', tag: 'shy', label: 'Shy', words: ['shy', 'embarrassed'] },
  { id: 'vacant', tag: 'vacant', label: 'Vacant', words: ['vacant', 'blank stare', 'empty stare', 'fucked dumb'] },
]

// WD14 tags (LoRA training auto-tagger) that mean one of the emotions above.
// Only specific tags — a generic "smile" or "open mouth" is not an emotion here.
const WD_TAGS = [
  ['ahegao', ['ahegao']],
  ['orgasm', ['orgasm', 'torogao']],
  ['crying', ['crying', 'streaming_tears', 'tears']],
  ['tongue_out', ['tongue_out']],
  ['biting_lip', ['lip_biting']],
  ['disgust', ['disgust']],
  ['angry', ['angry', 'anger_vein']],
  ['shocked', ['surprised']],
  ['panting', ['panting', 'heavy_breathing']],
  ['smirk', ['smirk', 'smug']],
  ['shy', ['embarrassed', 'shy']],
  ['vacant', ['empty_eyes']],
  ['lustful', ['naughty_face', 'seductive_smile']],
  ['moaning', ['moaning']],
  ['pleading', ['tearing_up']],
]

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

// First emotion mentioned in a prompt or a file name. Returns the emotion or null.
export function matchEmotion(text) {
  const t = String(text || '')
  let best = null
  for (const e of EMOTIONS) {
    for (const w of e.words) {
      const i = wordAt(t, w)
      if (i < 0) continue
      if (!best || i < best.i || (i === best.i && w.length > best.len)) best = { e, i, len: w.length }
    }
  }
  return best?.e || null
}

// One emotion from a WD14 (or sentence) caption. Null when none of the tags are an emotion.
export function emotionFromCaption(caption) {
  const tags = String(caption || '').toLowerCase().split(/[,]+/).map(t => t.trim().replace(/\s+/g, '_')).filter(Boolean)
  for (const [id, keys] of WD_TAGS) {
    if (keys.some(k => tags.some(t => t === k || t.endsWith('_' + k) || t.startsWith(k + '_')))) {
      return EMOTIONS.find(e => e.id === id) || null
    }
  }
  return matchEmotion(String(caption || '').replace(/_/g, ' '))
}

export function emotionMap(character) {
  const raw = character?.emotions
  return raw && typeof raw === 'object' ? raw : {}
}

export function setCharacterEmotion(name, emotionId, image) {
  const list = loadCharacters()
  const c = list.find(x => x.name === name)
  if (!c) return 'That character is gone — pick another'
  const emotions = { ...emotionMap(c) }
  if (image) emotions[emotionId] = image
  else delete emotions[emotionId]
  c.emotions = emotions
  return saveCharacters(list) ? '' : 'Browser storage is full — delete a character or some pictures first'
}

// The emotion shot to use as the face reference for this prompt, or null.
export function emotionForPrompt(characterName, prompt) {
  if (!characterName) return null
  const e = matchEmotion(prompt)
  if (!e) return null
  const image = emotionMap(loadCharacters().find(c => c.name === characterName))[e.id]
  return image ? { ...e, image } : null
}
