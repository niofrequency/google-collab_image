import { useState } from 'react'
import Info from './Info.jsx'
import { withCivitaiToken } from './civitai.js'

// Image to Video: your LoRAs, like the Image Generator's — download from a Civitai / Hugging Face link,
// pick from the downloaded ones, set the strength. On the A14B notebook each LoRA can go on both models
// or only the high-noise (motion) / low-noise (detail) one, for Wan 2.2 LoRAs that come as a pair.

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function VideoLoras({ backend, info, loras, setLoras, onDownloaded, say }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const files = info?.lora_files || []
  const targets = !!info?.lora_targets

  function update(i, patch) { setLoras(loras.map((x, idx) => idx === i ? { ...x, ...patch } : x)) }
  function add(name) {
    if (!name || loras.some(l => l.name === name)) return
    setLoras([...loras, { name, strength: 1, target: 'auto' }])
  }

  async function download() {
    if (!backend) return say('Paste the video server URL first', 'error')
    if (!newUrl.trim()) return say('Paste a Civitai or Hugging Face LoRA link', 'error')
    setBusy(true)
    say('Downloading LoRA...')
    try {
      const res = await fetch(backend + '/download_model', { method: 'POST', headers: HEADERS, body: JSON.stringify({ url: withCivitaiToken(newUrl), type: 'lora' }) })
      if (res.status === 404) throw new Error('This video notebook is an older version without LoRAs — open it fresh from GitHub, run cells 1–3 and paste the new URL')
      let data = await res.json()
      const jobId = data.job_id
      while (data.status !== 'done' && data.status !== 'error') {
        await sleep(2000)
        try { data = await (await fetch(`${backend}/job/${jobId}`, { headers: HEADERS })).json() } catch { /* restarting */ }
        const mb = data.done_mb ? ` ${data.done_mb}${data.total_mb ? ' / ' + data.total_mb : ''} MB` : ''
        say(`Downloading LoRA${data.filename ? ' ' + data.filename : ''}...${mb}`)
      }
      if (data.status === 'error') throw new Error(data.error || 'Download failed')
      await onDownloaded()
      add(data.filename)
      setNewUrl('')
      setShowAdd(false)
      say(`Added LoRA ${data.filename} (strength 1.0)`, 'ok')
    } catch (e) {
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 3 still running in Colab?' : e.message, 'error')
    }
    setBusy(false)
  }

  if (info && !info.supports_loras) {
    return (<>
      <label>LoRAs</label>
      <div className="empty-msg">This video notebook is an older version without LoRAs — open it fresh from GitHub, run cells 1–3 and paste the new URL.</div>
    </>)
  }

  return (<>
    <label>LoRAs {info?.family === '5b' ? '(Wan 2.2 5B LoRAs)' : '(Wan 2.2 A14B / Wan 2.1 14B LoRAs)'} <Info text={<>Add motion, style or character LoRAs, like in the Image Generator: <b>+ Download LoRA</b> and paste a Civitai or Hugging Face link. They're saved in Google Drive (MyDrive/ComfyUI/loras_wan22_…) for next time.<br /><br /><b>Which LoRAs</b>: the A14B notebook takes Wan 2.2 A14B I2V LoRAs and most Wan 2.1 14B I2V LoRAs; the free 5B notebook only takes Wan 2.2 5B LoRAs. Image-model LoRAs (SDXL, Qwen…) don't work on video — the server says so if a LoRA doesn't fit.<br /><br /><b>Strength</b>: 1.0 is usual for video LoRAs; lower (0.6–0.8) if the motion looks overdone.{targets && <><br /><br /><b>Model</b> (A14B): Wan 2.2 runs two models — <i>high-noise</i> (motion and layout) then <i>low-noise</i> (details). Wan 2.2 LoRAs often come as a <b>pair</b> (…_high_noise / …_low_noise): add both; <i>Auto</i> puts each on its model from the file name. Other LoRAs go on <i>Both</i>.</>}</>} /></label>
    {loras.length === 0 && <div className="empty-msg">No LoRAs in use.{files.length ? ' Pick one below, or download a new one.' : ''}</div>}
    {loras.map((l, i) => (
      <div key={l.name + i} className="lora-item">
        <select value={l.name} onChange={e => update(i, { name: e.target.value })}>
          {!files.includes(l.name) && <option value={l.name}>{l.name} (not on server)</option>}
          {files.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input type="number" step="0.05" value={l.strength} style={{ width: 80 }} title="Strength"
          onChange={e => update(i, { strength: parseFloat(e.target.value) })} />
        {targets && (
          <select className="lora-target" value={l.target || 'auto'} title="Which Wan 2.2 model this LoRA goes on" onChange={e => update(i, { target: e.target.value })}>
            <option value="auto">Auto (from the name)</option>
            <option value="both">Both models</option>
            <option value="high">High-noise (motion)</option>
            <option value="low">Low-noise (detail)</option>
          </select>
        )}
        <button className="danger" onClick={() => setLoras(loras.filter((_, idx) => idx !== i))}>Remove</button>
      </div>
    ))}
    {files.some(f => !loras.some(l => l.name === f)) && (
      <div className="lora-item">
        <select value="" onChange={e => add(e.target.value)}>
          <option value="">+ Use a downloaded LoRA...</option>
          {files.filter(f => !loras.some(l => l.name === f)).map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
    )}
    {showAdd && (
      <div className="add-box">
        <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="Civitai or Hugging Face Wan LoRA link (page or download link)"
          onKeyDown={e => e.key === 'Enter' && download()} />
        <div className="row">
          <button className="secondary" disabled={busy} onClick={download}>{busy ? 'Downloading...' : 'Download & Add'}</button>
          <button className="secondary" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      </div>
    )}
    <button className="secondary" onClick={() => setShowAdd(true)}>+ Download LoRA</button>
  </>)
}
