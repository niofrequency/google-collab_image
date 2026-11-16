import { useState, useRef } from 'react'

// Progressive gallery prompt templates (clothed teasing → full nude explicit)
// {clothing} will be replaced with the user's clothing description
// {subject} will be replaced with the subject + LoRA line

const GALLERY_TEMPLATES = [
  // 1-4: Fully clothed / teasing
  `{subject}, standing full body, wearing {clothing}, hands clasped in front, cute smile, soft indoor lighting, bedroom background, photorealistic, 8k, highly detailed skin texture, natural expression`,
  `{subject}, sitting on bed edge, wearing {clothing}, legs crossed, looking at camera with a soft smile, soft lighting, photorealistic, 8k, detailed skin`,
  `{subject}, standing, slightly lifting the skirt of {clothing} with one hand, teasing, looking down at camera, soft lighting, photorealistic, 8k`,
  `{subject}, kneeling, wearing {clothing}, looking up at camera with a playful expression, soft indoor lighting, photorealistic, 8k, detailed skin texture`,

  // 5-8: Clothing partially removed / teasing more
  `{subject}, standing, {clothing} pulled up to expose panties, looking at camera seductively, soft lighting, photorealistic, 8k, thick thighs, small perky tits`,
  `{subject}, sitting with legs spread, {clothing} skirt lifted, pink pantyhose still on, hands on thighs, cute smile, soft lighting, photorealistic, 8k`,
  `{subject}, standing low angle, looking down between legs, {clothing} still on but skirt lifted, soft seductive expression, photorealistic, 8k`,
  `{subject}, half body, sitting on bed, {clothing} pulled up to waist, pink pantyhose pulled to mid-thigh, looking at camera with a shy smile, soft lighting, photorealistic, 8k`,

  // 9-12: Nude with some clothing still on
  `{subject}, standing, {clothing} pulled up high, no panties, pink pantyhose pulled down to knees, one hand spreading pussy slightly, looking at camera, soft lighting, photorealistic, 8k, highly detailed natural vulva, realistic labia with natural folds, subtle moisture`,
  `{subject}, sitting on bed edge, legs spread wide, {clothing} pulled up, pink pantyhose pulled down, hands resting on thighs, seductive smile, soft lighting, photorealistic, 8k, detailed skin, thick thighs`,
  `{subject}, standing one leg raised high, {clothing} pulled up, pink pantyhose pulled down on one leg, pussy fully exposed, confident expression, soft lighting, photorealistic, 8k, highly detailed natural vulva`,
  `{subject}, kneeling on bed, looking back over shoulder, {clothing} still partially on, ass raised, soft lighting, photorealistic, 8k`,

  // 13-16: Fully nude poses
  `{subject}, fully nude, only wearing pink striped socks, lying on back with legs spread wide and held up, looking down at camera with seductive expression, soft bedroom lighting, photorealistic, 8k, highly detailed natural vulva, realistic labia majora and minora with natural folds, asymmetry and texture, visible clitoral hood, realistic pubic hair that is not perfectly trimmed, subtle natural moisture, visible pores`,
  `{subject}, fully nude, doggystyle on all fours, ass raised high, looking back over shoulder with playful smile, pink striped socks, soft lighting, photorealistic, 8k, highly detailed natural vulva and asshole visible`,
  `{subject}, fully nude, extreme low-angle POV from between legs, holding legs up spreading wide, looking down at camera, soft lighting, photorealistic, 8k, highly detailed natural vulva, realistic labia with natural folds, subtle moisture, visible pores`,
  `{subject}, fully nude, sitting on bed with one leg raised high, pussy spread toward camera, seductive smile, soft lighting, photorealistic, 8k, highly detailed natural vulva`,

  // 17-20: Extreme closeups + cum
  `{subject}, extreme closeup of pussy filling the frame, fully nude, soft lighting, photorealistic, 8k, highly detailed natural vulva, realistic labia majora and minora with natural folds, asymmetry and texture, visible clitoral hood, realistic pubic hair that is not perfectly trimmed, subtle natural moisture and skin sheen only on the genitals, visible pores, fine skin texture, slight natural imperfections`,
  `{subject}, extreme closeup from behind doggystyle, ass cheeks slightly spread, both pussy and asshole clearly visible, fully nude, soft lighting, photorealistic, 8k, highly detailed natural vulva and asshole, realistic labia with folds, subtle moisture`,
  `{subject}, closeup portrait, face covered in thick white cum, some dripping from chin, mouth slightly open, dazed happy expression, soft lighting, photorealistic, 8k, highly detailed skin and cum texture, long eyelashes`,
  `{subject}, half-body, face completely covered in thick white cum, mouth wide open, tongue out, cum dripping heavily from mouth and chin down onto small perky tits, ahegao-like expression, soft lighting, photorealistic, 8k, highly detailed cum and skin`,
]

export default function GalleryPrompts() {
  const [subject, setSubject] = useState('woman, bright shoulder-length pink hair bobcut with parted bangs solid pink hair with a purple headband with small silver studs, eyelines and long eyelashes, cute face, small and slightly chubby body, thick thighs, small perky tits')
  const [lora, setLora] = useState('zxq_steph')
  const [clothingDesc, setClothingDesc] = useState('sleeveless V-neck mini dress with vertical light pink and hot pink stripes, slightly shiny fabric, short flared skirt, pink pantyhose, pink knitted leg warmers, pink and white sneakers')
  const [clothingImage, setClothingImage] = useState(null)
  const [prompts, setPrompts] = useState([])
  const [copied, setCopied] = useState(null)  // 'all' or a prompt id: shows "Copied ✓" on that button for a moment
  const fileInputRef = useRef(null)

  function generate() {
    const loraPrefix = lora.trim() ? `lora:${lora.trim()}, ` : ''
    const subjectLine = loraPrefix + subject.trim()

    const generated = GALLERY_TEMPLATES.map((tpl, i) => {
      const prompt = tpl
        .replaceAll('{subject}', subjectLine)
        .replaceAll('{clothing}', clothingDesc.trim() || 'pink outfit')
      return { id: i + 1, prompt }
    })

    setPrompts(generated)
  }

  function flashCopied(key) {
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
  }

  function copyAll() {
    const text = prompts.map(p => p.prompt).join('\n\n')
    navigator.clipboard.writeText(text).then(() => flashCopied('all'), () => alert('Could not copy — select the text and copy it by hand'))
  }

  function copyOne(prompt, id) {
    navigator.clipboard.writeText(prompt).then(() => flashCopied(id), () => alert('Could not copy — select the text and copy it by hand'))
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setClothingImage(url)
  }

  return (
    <div className="container gallery-prompts">
      <h1>Gallery Prompt Generator</h1>
      <p className="gp-intro">
        Generate a full progressive gallery (clothed teasing → full nude explicit) in the style of ATK-style sets.
      </p>

      <div className="row gp-top-row">
        <div>
          <label>Subject Description</label>
          <textarea
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="woman, pink bob hair, purple headband, cute face, thick thighs..."
            className="gp-textarea"
          />
        </div>
        <div>
          <label>LoRA Name (optional)</label>
          <input
            value={lora}
            onChange={e => setLora(e.target.value)}
            placeholder="zxq_steph"
          />
          <small className="gp-note">Will be added as lora:name at the start of every prompt</small>
        </div>
      </div>

      <label>Clothing Description</label>
      <textarea
        value={clothingDesc}
        onChange={e => setClothingDesc(e.target.value)}
        placeholder="sleeveless V-neck mini dress with vertical pink stripes, pink pantyhose, pink leg warmers..."
        className="gp-textarea"
      />

      <label>Clothing Reference Image (optional, for your reference only)</label>
      <div className="gp-ref">
        <div>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button className="secondary gp-upload" onClick={() => fileInputRef.current?.click()}>
            Upload Clothing Image
          </button>
        </div>
        {clothingImage && (
          <img
            src={clothingImage}
            alt="clothing reference"
            className="gp-ref-img"
          />
        )}
      </div>

      <div className="gp-actions">
        <button onClick={generate}>Generate 20 Prompts</button>
        {prompts.length > 0 && (
          <button className="secondary" onClick={copyAll}>{copied === 'all' ? 'Copied ✓' : 'Copy All'}</button>
        )}
      </div>

      {prompts.length > 0 && (
        <div className="gp-results">
          <h2>Generated Gallery Prompts <span className="muted">· {prompts.length}</span></h2>
          <div className="gp-list">
            {prompts.map(p => (
              <div key={p.id} className="gp-card">
                <div className="gp-card-head">
                  <strong>#{p.id}</strong>
                  <button className="secondary" onClick={() => copyOne(p.prompt, p.id)}>
                    {copied === p.id ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <pre>
                  {p.prompt}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
