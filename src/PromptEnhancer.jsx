import { useRef, useState } from 'react'

// Prompt enhancer: uses the tags your LoRAs were trained with (kohya saves how often every caption tag was used
// inside the .safetensors file). Type plain words — "shirt" — and it offers the LoRA's own tags for it
// ("white shirt", "collared shirt"), plus the trigger word and the tags that were in almost every training picture.
const STOP = new Set(('a an the and or of in on at to with without for from by is are be wearing wears wear has have ' +
  'her his their its this that very some into onto over under while who which as it she he they').split(' '))

const words = text => (text || '').toLowerCase()
  .replace(/:\s*[\d.]+\s*\)/g, ')')        // (tag:1.2) -> (tag)
  .split(/[^a-z0-9]+/).filter(Boolean)
// rough word stem, so "shirts" finds "shirt", "smiling" finds "smile", "sitting" finds "sit"
function stem(w) {
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 5 && w.endsWith('ing')) { w = w.slice(0, -3); if (/([^aeiou])\1$/.test(w)) w = w.slice(0, -1) }
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}
const phrase = text => words(text).map(stem).join(' ')

function inPrompt(tag, promptPhrase) {
  const p = phrase(tag)
  return !!p && ` ${promptPhrase} `.includes(` ${p} `)
}

// Groups of suggestions for one prompt + the LoRAs' tag lists
export function buildSuggestions(prompt, tagLists) {
  const promptPhrase = phrase(prompt)
  const shown = new Map()   // stem -> the word as you typed it
  for (const w of words(prompt)) if (!STOP.has(w) && w.length > 1 && !shown.has(stem(w))) shown.set(stem(w), w)
  const promptWords = [...shown.keys()]
  const seen = new Set()
  const take = tag => {
    const k = tag.toLowerCase()
    if (seen.has(k) || inPrompt(tag, promptPhrase)) return false
    seen.add(k)
    return true
  }
  const always = [], byWord = new Map(), often = [], more = []
  for (const { data } of tagLists) {
    const n = Math.max(1, data.images || 0)
    for (const t of data.trigger || []) if (take(t)) always.push({ tag: t, pct: 100, trigger: true })
    for (const { tag, count } of data.tags || []) if (count / n >= 0.9 && always.length < 8 && take(tag)) always.push({ tag, pct: Math.round(100 * count / n) })
  }
  for (const w of promptWords) {
    const list = []
    for (const { data } of tagLists) {
      const n = Math.max(1, data.images || 0)
      for (const { tag, count } of data.tags || []) {
        const tw = words(tag).map(stem)
        if (tw.includes(w) && phrase(tag) !== w && !seen.has(tag.toLowerCase()) && !inPrompt(tag, promptPhrase)) list.push({ tag, pct: Math.round(100 * count / n), count })
      }
    }
    list.sort((a, b) => b.count - a.count)
    const picked = []
    for (const s of list) { if (picked.length >= 8) break; if (take(s.tag)) picked.push(s) }
    if (picked.length) byWord.set(shown.get(w), picked)
  }
  for (const { data } of tagLists) {
    const n = Math.max(1, data.images || 0)
    for (const { tag, count } of data.tags || []) {
      const pct = Math.round(100 * count / n)
      if (pct >= 40 && often.length < 14) { if (take(tag)) often.push({ tag, pct }) }
      else if (more.length < 60 && take(tag)) more.push({ tag, pct })
    }
  }
  return { always, byWord, often, more }
}

export default function PromptEnhancer({ backend, loras, positive, setPositive, say }) {
  const cache = useRef({})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // { groups, info: [{name, images, tags, note}] }
  const [picked, setPicked] = useState(new Set())
  const [showMore, setShowMore] = useState(false)

  async function run() {
    const names = [...new Set(loras.filter(l => l.name && +l.strength !== 0).map(l => l.name))]
    if (!backend) return say('Set Backend URL first', 'error')
    if (!names.length) return say('Add a LoRA first — the enhancer uses the tags your LoRAs were trained with', 'error')
    setBusy(true)
    try {
      const lists = []
      for (const name of names) {
        if (!cache.current[name]) {
          const res = await fetch(`${backend}/lora_tags?name=${encodeURIComponent(name)}`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
          if (res.status === 404) throw new Error('This notebook has no prompt enhancer yet — open BIGLUST fresh from GitHub and run its cells again')
          const data = await res.json()
          if (data.error) throw new Error(data.error)
          cache.current[name] = data
        }
        lists.push({ name, data: cache.current[name] })
      }
      const groups = buildSuggestions(positive, lists)
      const sel = new Set(groups.always.map(s => s.tag))
      for (const list of groups.byWord.values()) sel.add(list[0].tag)   // the most-used tag for each of your words
      setResult({ groups, info: lists.map(({ name, data }) => ({ name, images: data.images, tags: (data.tags || []).length, note: data.note })) })
      setPicked(sel)
      setShowMore(false)
      setOpen(true)
    } catch (e) {
      say(e.message === 'Failed to fetch' || e.message === 'Load failed' ? 'Can\'t reach the backend — check the URL and that cell 3 is running' : e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function toggle(tag) {
    setPicked(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n })
  }

  function apply() {
    const { groups } = result
    const first = groups.always.map(s => s.tag).filter(t => picked.has(t))
    const rest = [...picked].filter(t => !first.includes(t))
    const body = positive.trim().replace(/,\s*$/, '')
    const next = [first.join(', '), body, rest.join(', ')].filter(Boolean).join(', ')
    setPositive(next)
    setOpen(false)
    say(picked.size ? `Added ${picked.size} tag(s) from your LoRA's training` : 'Nothing added', 'ok')
  }

  const chip = s => (
    <button key={s.tag} className={`chip ${picked.has(s.tag) ? 'active' : ''}`} onClick={() => toggle(s.tag)}
      title={s.trigger ? 'Trigger word' : `In ${s.pct}% of the training pictures`}>
      {s.tag}{!s.trigger && <span className="enh-pct">{s.pct}%</span>}
    </button>
  )

  const g = result?.groups
  const empty = g && !g.always.length && !g.byWord.size && !g.often.length && !g.more.length
  return (
    <>
      <button className="secondary enhance-btn" onClick={run} disabled={busy}
        title="Suggests tags from your LoRAs' training captions: the trigger word, and the LoRA's own tags for the words you typed (e.g. 'shirt' → 'white shirt')">
        {busy ? 'Reading LoRA tags…' : '✨ Enhance with LoRA tags'}
      </button>
      {open && result && (
        <div className="enhancer">
          <div className="muted small-note">
            {result.info.map(i => <div key={i.name}><b>{i.name.split('/').pop()}</b> — {i.note || `${i.tags} tags from ${i.images} training picture(s)`}</div>)}
            Green = will be added. Click a tag to add or remove it.
          </div>
          {empty && <div className="muted small-note">No new tags to suggest.</div>}
          {g.always.length > 0 && (<>
            <div className="enh-head">Trigger / in almost every training picture</div>
            <div className="chips">{g.always.map(chip)}</div>
          </>)}
          {[...g.byWord.entries()].map(([w, list]) => (
            <div key={w}>
              <div className="enh-head">“{w}” → the LoRA's tags</div>
              <div className="chips">{list.map(chip)}</div>
            </div>
          ))}
          {g.often.length > 0 && (<>
            <div className="enh-head">Often in the training pictures</div>
            <div className="chips">{g.often.map(chip)}</div>
          </>)}
          {g.more.length > 0 && (
            <>
              <button className="link-btn" onClick={() => setShowMore(v => !v)}>{showMore ? 'Hide' : 'Show'} all other tags ({g.more.length})</button>
              {showMore && <div className="chips">{g.more.map(chip)}</div>}
            </>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={apply}>Add {picked.size} tag(s) to the prompt</button>
            <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
