// The Colab notebooks (the backends): what each one is for, which GPU to pick, and a link to open it.
const REPO = 'https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/'

const GROUPS = [
  {
    title: 'Images',
    items: [
      { file: 'BIGLUST.ipynb', name: 'BigLust (SDXL)', tab: 'generate', tabName: 'Image Generator', gpu: 'T4 free · L4 better',
        what: 'Text-to-image with BigLust or any SDXL checkpoint (Juggernaut, Pony…), LoRAs, Face reference (FaceID, PuLID, InstantID…), face / hand fix, pose & style pictures, inpaint, refiner and detail tools.' },
      { file: 'KREA2.ipynb', name: 'Krea 2 Realism', tab: 'generate', tabName: 'Image Generator', gpu: 'L4 · A100',
        what: 'Very realistic text-to-image with Krea 2 and its LoRAs (yours are saved to Google Drive). Face fix, eye / hand detail, CodeFormer and Variation; switch between it and BigLust with the Model buttons.' },
      { file: 'QWEN-2511-IMAGE-EDIT.ipynb', name: 'Qwen Image Edit 2511', tab: 'generate', tabName: 'Image Generator', gpu: 'L4 · A100',
        what: 'Edits photos from a text instruction with up to 3 reference pictures (the official 2511 model, 4-step Lightning). Also text-to-image and inpaint.' },
      { file: 'QWEN-AIO-NSFW-EDIT.ipynb', name: 'Qwen Image Edit Rapid AIO', tab: 'generate', tabName: 'Image Generator', gpu: 'T4 · L4',
        what: 'Same website features as Qwen 2511, with the Rapid AIO all-in-one model and Qwen LoRAs.' },
      { file: 'UPSCALE.ipynb', name: 'Upscale', tab: 'upscale', tabName: 'Upscale', gpu: 'T4 is fine',
        what: 'Pictures 2–4× bigger and sharper (4x-UltraSharp / Real-ESRGAN, optional face restore); videos to 720p–1440p with the sound kept.' },
    ],
  },
  {
    title: 'Faces',
    items: [
      { file: 'HEADSWAP.ipynb', name: 'Head Swap', tab: 'headswap', tabName: 'Head Swap', gpu: 'L4 · A100',
        what: 'The whole head (face, hair, head shape) from one photo onto the person in another — pose, body, light and background kept.' },
      { file: 'FACESWAP.ipynb', name: 'Face Swap', tab: 'faceswap', tabName: 'Face Swap', gpu: 'T4 · L4 faster',
        what: 'Only the face from one photo onto the person in another; their hair and head shape stay.' },
    ],
  },
  {
    title: 'Video & music',
    items: [
      { file: 'IMG2VID-WAN22-A14B.ipynb', name: 'Image to Video — Wan 2.2 A14B (best)', tab: 'video', tabName: 'Image to Video', gpu: 'L4 · A100',
        what: 'Animates a still picture into a short video (up to ~7.5 s), with an optional end picture, LoRAs and sound.' },
      { file: 'IMG2VID-WAN22-5B-FREE.ipynb', name: 'Image to Video — Wan 2.2 5B', tab: 'video', tabName: 'Image to Video', gpu: 'T4 free',
        what: 'The same with a smaller model that fits the free T4 (up to 5 s, lower quality).' },
      { file: 'MUSIC-ACESTEP.ipynb', name: 'Music — ACE-Step 1.5', tab: 'music', tabName: 'Music', gpu: 'T4 free · L4 better',
        what: 'Songs with vocals and lyrics, or instrumentals, from a style description.' },
    ],
  },
  {
    title: 'LoRA training',
    items: [
      { file: 'SDXL-LORA-TRAINING.ipynb', name: 'SDXL LoRA training', tab: 'train', tabName: 'LoRA Training', gpu: 'T4 free · L4 faster',
        what: 'Train your own SDXL LoRA (a person, character or style) from 15–40 pictures — for BigLust.' },
      { file: 'KREA2-LORA-TRAINING.ipynb', name: 'Krea 2 LoRA training', tab: 'train', tabName: 'LoRA Training', gpu: 'A100 · L4 slower',
        what: 'Train your own Krea 2 LoRA (a person, character or style) on your Krea 2 Realism model — for the Krea 2 notebook. About 1–2 hours for a face on an A100.' },
      { file: 'QWEN-2511-LORA-TRAINING.ipynb', name: 'Qwen 2511 LoRA training', tab: 'train', tabName: 'LoRA Training', gpu: 'A100 · L4 slower',
        what: 'LoRAs for Qwen Image Edit 2511: a character, or an edit effect from Before → After pairs.' },
    ],
  },
]

const OLDER = [
  { file: 'INTO-REALISM.ipynb', name: 'Into Realism (SDXL)', what: 'Older SDXL text-to-image notebook with a website server.' },
  { file: 'Wan2.1_T2I_jupyter.ipynb', name: 'Wan 2.1 (GGUF)', what: 'Text-to-image with Wan 2.1 14B inside the notebook (no website server).' },
]

const goTo = tab => window.dispatchEvent(new CustomEvent('go-to-tab', { detail: tab }))

function Card({ n }) {
  return (
    <div className="nb-card">
      <div className="nb-head">
        <strong>{n.name}</strong>
        {n.gpu && <span className="nb-gpu" title="Runtime → Change runtime type in Colab">{n.gpu}</span>}
      </div>
      <p className="nb-what">{n.what}</p>
      <div className="nb-actions">
        <a className="nb-open" href={REPO + n.file} target="_blank" rel="noreferrer">Open in Colab ↗</a>
        {n.tab && <button className="secondary" onClick={() => goTo(n.tab)}>Go to {n.tabName}</button>}
      </div>
    </div>
  )
}

export default function Notebooks() {
  return (
    <div className="container notebooks">
      <h1>Notebooks</h1>
      <p className="muted nb-intro">
        Each part of this site runs on a free or paid GPU in Google Colab. Pick the notebook for what you want to do:
      </p>
      <ol className="nb-steps">
        <li><b>Open in Colab</b> below (sign in with your Google account).</li>
        <li><b>Runtime → Change runtime type</b> → the GPU shown on the card (T4 is free; L4 / A100 need Colab Pro or compute units).</li>
        <li>Run <b>cells 1, 2 and 3</b> (or <b>Runtime → Run all</b>). Allow Google Drive when asked — it keeps your LoRAs and models between sessions.</li>
        <li>Copy the <b>READY: https://….trycloudflare.com</b> address that cell 3 prints, and paste it into the tab shown on the card.</li>
      </ol>
      <p className="muted small-note">Always open a notebook from here (fresh from GitHub) after an update, so you get the latest version. When you're done, use <b>Runtime → Disconnect and delete runtime</b> to stop using GPU time.</p>

      {GROUPS.map(g => (
        <section key={g.title} className="nb-group">
          <h3>{g.title}</h3>
          <div className="nb-grid">{g.items.map(n => <Card key={n.file} n={n} />)}</div>
        </section>
      ))}

      <details className="nb-group nb-older">
        <summary>Older notebooks</summary>
        <div className="nb-grid">{OLDER.map(n => <Card key={n.file} n={n} />)}</div>
      </details>
    </div>
  )
}
