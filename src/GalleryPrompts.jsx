import { useState, useRef } from 'react'

// Progression stages for the gallery
const STAGES = [
  { name: "Fully Clothed Seductive", count: 4, nudeLevel: 0 },
  { name: "Teasing / Clothing Adjusted", count: 4, nudeLevel: 1 },
  { name: "Partial Nude", count: 4, nudeLevel: 2 },
  { name: "Fully Nude", count: 4, nudeLevel: 3 },
  { name: "Explicit + Fluids", count: 4, nudeLevel: 4 },
]

const POSES = [
  "standing with weight on one leg, hand on hip",
  "sitting on the edge of the bed, legs crossed",
  "kneeling on the bed, looking back over shoulder",
  "standing low angle, looking down at camera",
  "lying on back with one leg raised",
  "bending slightly forward, hands on thighs",
  "sitting with legs spread",
  "leaning against the wall, one leg bent",
  "on all fours looking back",
  "standing with one leg up on the bed",
]

const EXPRESSIONS = [
  "soft seductive smile, half-lidded eyes",
  "playful smirk, tongue slightly out",
  "shy blushing look, biting lower lip",
  "intense eye contact, mouth slightly open",
  "ahegao-like expression, eyes rolled back, tongue out",
  "dazed happy expression with open mouth",
  "confident smirk looking at camera",
  "moaning expression, eyes half closed",
]

const ANGLES = [
  "full body shot",
  "half body shot",
  "medium shot from the waist up",
  "close-up portrait",
  "extreme close-up of face",
  "low angle looking up",
  "high angle looking down",
  "from behind",
  "side view",
  "POV from between legs",
]

const FLUIDS = [
  "thick white cum on face, dripping from chin and lips",
  "face completely covered in thick white cum, mouth open, tongue out",
  "cum dripping from mouth and chin onto tits",
  "pissing while sitting with legs spread, stream visible",
  "sitting on toilet pissing, looking at camera",
  "cum on face and chest, dazed expression",
  "pussy wet with visible moisture and slight piss drip",
]

export default function GalleryPrompts() {
  const [subject, setSubject] = useState('woman, bright shoulder-length pink hair bobcut with parted bangs, purple headband with small silver studs, eyelines and long eyelashes, cute face, small and slightly chubby body, thick thighs, small perky tits')
  const [lora, setLora] = useState('zxq_steph')
  const [clothing, setClothing] = useState('sleeveless V-neck mini dress with vertical light pink and hot pink stripes, slightly shiny fabric, short flared skirt, pink pantyhose, pink knitted leg warmers, pink and white sneakers')
  const [pose, setPose] = useState('')
  const [expression, setExpression] = useState('')
  const [camera, setCamera] = useState('')
  const [lighting, setLighting] = useState('soft warm indoor bedroom lighting, gentle shadows')
  const [background, setBackground] = useState('messy bedroom with bed, soft focus background')
  const [prompts, setPrompts] = useState([])
  const [copied, setCopied] = useState(null)

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  function generate() {
    const loraPrefix = lora.trim() ? `lora:${lora.trim()}, ` : ''
    const subjectLine = loraPrefix + subject.trim()
    const baseLighting = lighting.trim() || 'soft indoor lighting'
    const baseBackground = background.trim() || 'bedroom background'

    const generated = []
    let id = 1

    STAGES.forEach((stage) => {
      for (let i = 0; i < stage.count; i++) {
        const usePose = pose.trim() || randomFrom(POSES)
        const useExpression = expression.trim() || randomFrom(EXPRESSIONS)
        const useCamera = camera.trim() || randomFrom(ANGLES)

        let clothingState = clothing.trim() || 'pink outfit'
        let extra = ''

        if (stage.nudeLevel === 0) {
          // Fully clothed
          extra = ''
        } else if (stage.nudeLevel === 1) {
          clothingState = `${clothing.trim()} pulled up slightly, teasing, skirt lifted`
        } else if (stage.nudeLevel === 2) {
          clothingState = `${clothing.trim()} pulled up to waist, pink pantyhose pulled down to mid-thigh, no panties`
          extra = ', pussy partially visible'
        } else if (stage.nudeLevel === 3) {
          clothingState = 'fully nude, only pink striped socks remaining'
          extra = ', highly detailed natural vulva, realistic labia with natural folds, subtle moisture'
        } else if (stage.nudeLevel === 4) {
          clothingState = 'fully nude'
          extra = ', ' + randomFrom(FLUIDS) + ', highly detailed natural vulva'
        }

        const prompt = [
          subjectLine,
          useCamera,
          usePose,
          `wearing ${clothingState}`,
          useExpression,
          extra,
          baseLighting,
          baseBackground,
          'photorealistic, 8k, highly detailed skin texture, natural skin pores, realistic lighting, Krea 2 style'
        ].filter(Boolean).join(', ')

        generated.push({ id: id++, stage: stage.name, prompt })
      }
    })

    setPrompts(generated)
  }

  function flashCopied(key) {
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
  }

  function copyAll() {
    const text = prompts.map(p => p.prompt).join('\n\n')
    navigator.clipboard.writeText(text).then(() => flashCopied('all'))
  }

  function copyOne(prompt, id) {
    navigator.clipboard.writeText(prompt).then(() => flashCopied(id))
  }

  return (
    <div className="container gallery-prompts">
      <h1>Gallery Prompt Generator (Krea 2)</h1>
      <p className="gp-intro">
        Fill the boxes below. The generator creates a full progressive gallery (clothed seductive → full nude + fluids) with randomized poses, expressions, and angles.
      </p>

      <div className="row gp-top-row">
        <div>
          <label>1. Subject / Identity</label>
          <textarea value={subject} onChange={e => setSubject(e.target.value)} className="gp-textarea" placeholder="woman, pink bob hair, cute face, thick thighs..." />
        </div>
        <div>
          <label>LoRA Name (optional)</label>
          <input value={lora} onChange={e => setLora(e.target.value)} placeholder="zxq_steph" />
          <small className="gp-note">Added as lora:name at the start</small>
        </div>
      </div>

      <label>2. Clothing / Outfit</label>
      <textarea value={clothing} onChange={e => setClothing(e.target.value)} className="gp-textarea" placeholder="sleeveless mini dress, pink pantyhose, leg warmers..." />

      <div className="row">
        <div>
          <label>3. Pose (leave blank to randomize)</label>
          <textarea value={pose} onChange={e => setPose(e.target.value)} className="gp-textarea" placeholder="standing, hands on hips..." />
        </div>
        <div>
          <label>4. Facial Expression (leave blank to randomize)</label>
          <textarea value={expression} onChange={e => setExpression(e.target.value)} className="gp-textarea" placeholder="seductive smile, half-lidded eyes..." />
        </div>
      </div>

      <div className="row">
        <div>
          <label>5. Camera / Angle / Framing (leave blank to randomize)</label>
          <textarea value={camera} onChange={e => setCamera(e.target.value)} className="gp-textarea" placeholder="half body shot, low angle..." />
        </div>
        <div>
          <label>6. Lighting</label>
          <textarea value={lighting} onChange={e => setLighting(e.target.value)} className="gp-textarea" />
        </div>
      </div>

      <label>7. Background / Setting</label>
      <textarea value={background} onChange={e => setBackground(e.target.value)} className="gp-textarea" />

      <div className="gp-actions">
        <button onClick={generate}>Generate Progressive Gallery (~20 prompts)</button>
        {prompts.length > 0 && (
          <button className="secondary" onClick={copyAll}>{copied === 'all' ? 'Copied ✓' : 'Copy All'}</button>
        )}
      </div>

      {prompts.length > 0 && (
        <div className="gp-results">
          <h2>Generated Prompts <span className="muted">· {prompts.length}</span></h2>
          <div className="gp-list">
            {prompts.map(p => (
              <div key={p.id} className="gp-card">
                <div className="gp-card-head">
                  <strong>#{p.id} — {p.stage}</strong>
                  <button className="secondary" onClick={() => copyOne(p.prompt, p.id)}>
                    {copied === p.id ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <pre>{p.prompt}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
