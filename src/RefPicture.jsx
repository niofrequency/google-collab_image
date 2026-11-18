import { useRef } from 'react'
import Info from './Info.jsx'
import { shrinkImage } from './FaceRef.jsx'

// BigLust: a second picture next to the Face reference — the body pose, the depth / framing, the style and outfit,
// or the picture to start from (img2img). The face still comes from the Face reference (or the prompt / LoRA).
export const REF_MODE_INFO = {
  pose: { label: 'Body pose', help: 'Copies the pose — body, arms, hands and head angle — from the picture (OpenPose skeleton + ControlNet). Clothes, face and background come from your prompt.' },
  depth: { label: 'Depth / framing', help: 'Copies the shapes, layout and camera framing (a depth map + ControlNet), more strictly than the pose. Good for the same composition with another person or outfit.' },
  style: { label: 'Style / outfit', help: 'Copies the look — outfit, colours, light and style — without fixing where things are (IP-Adapter Plus).' },
  scene: { label: 'Scene (put the person in it)', help: 'Krea 2: this picture is the scene, and your Face reference character is placed into it as the prompt says ("she sits at the console, looking at the screens"). Without a Face reference it works like Edit.' },
  edit: { label: 'Edit this picture', help: 'Krea 2: changes this picture the way the prompt says ("make it night", "change the suit to white", "remove the cup") and keeps the rest — like Qwen Edit, with Krea 2\'s realism.' },
  kdepth: { label: 'Depth / framing', help: 'Krea 2: copies the shapes, layout and camera framing (a depth map + the Krea 2 depth control). Strength 0.8–1.0. Can\'t be combined with Face reference yet — use Scene for that.' },
  img2img: { label: 'Img2img', help: 'Starts from the picture itself and redraws it. Denoise 0.3 stays close to it, 0.8 is only loosely based on it.' },
}
export const DEFAULT_REF_SETTINGS = { mode: 'pose', strength: 0.8, end: 0.85, denoise: 0.6, showMap: true }

export default function RefPicture({ image, setImage, settings, setSettings, modes, map, say, hoverRef }) {
  const fileRef = useRef(null)
  const set = patch => setSettings(prev => ({ ...prev, ...patch }))
  const mode = modes.includes(settings.mode) ? settings.mode : modes[0]

  async function useSrc(src) {
    try { setImage(await shrinkImage(src, 1024)); say?.('Pose / style picture loaded', 'ok') } catch (e) { say?.(e.message, 'error') }
  }

  return (
    <div className="ref-pic-box">
      <label>Pose / structure / style picture <span className="muted">(optional)</span> <Info text={<>
        A second picture that works <b>together with the Face reference</b>: the face comes from the Face reference (or your LoRA / prompt), and this picture sets the pose, the framing, the look, or the starting point.<br /><br />
        {Object.values(REF_MODE_INFO).map(m => <span key={m.label}><b>{m.label}</b>: {m.help}<br /></span>)}<br />
        <b>Strength</b>: how strongly it steers (0.8 default; lower = more freedom). <b>Until</b>: it stops steering at this point of the steps, so the last steps can refine details freely (0.85 default).<br /><br />
        Face fix never uses the pose / depth picture, so a full-body skeleton doesn't distort the close-up of the face. The pose, depth and style models download the first time you use them (2.5 / 2.5 / 0.85 GB).</>} /></label>
      <div className={`image-drop ref-pic-drop ${image ? 'has-image' : ''}`} role="button" tabIndex={0}
        title="Tap to choose a picture · drag & drop · hover and press Ctrl+V"
        onMouseEnter={() => { hoverRef.current = true }} onMouseLeave={() => { hoverRef.current = false }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/')); if (f) useSrc(URL.createObjectURL(f)) }}>
        {image ? (
          <div className="ref-pic-preview">
            <img src={image} alt="Pose / style picture" />
            {map && settings.showMap && <img src={map} alt="Pose / depth map used" title="The pose / depth map the last image used" />}
            <button className="danger train-del" title="Remove" onClick={e => { e.stopPropagation(); setImage(null) }}>×</button>
          </div>
        ) : <div><div className="image-drop-icon">🧍</div>Tap to choose a picture for the pose, framing or style — or drag & drop, or hover and paste (Ctrl+V)</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) useSrc(URL.createObjectURL(f)); e.target.value = '' }} />
      {image && (
        <div className="row ref-pic-settings">
          <div>
            <label>Use it for</label>
            <select value={mode} onChange={e => set({ mode: e.target.value })}>
              {modes.map(m => <option key={m} value={m}>{REF_MODE_INFO[m]?.label || m}</option>)}
            </select>
          </div>
          {mode === 'scene' || mode === 'edit' ? null : mode !== 'img2img' ? (<>
            <div>
              <label>Strength</label>
              <input type="number" step="0.05" min="0" max="1.5" value={settings.strength} onChange={e => set({ strength: e.target.value })} />
            </div>
            {mode !== 'kdepth' && <div>
              <label>Until</label>
              <input type="number" step="0.05" min="0.1" max="1" value={settings.end} onChange={e => set({ end: e.target.value })} title="Stops steering at this fraction of the steps" />
            </div>}
          </>) : (
            <div>
              <label>Denoise</label>
              <input type="number" step="0.05" min="0.05" max="1" value={settings.denoise} onChange={e => set({ denoise: e.target.value })} />
            </div>
          )}
        </div>
      )}
      {image && <div className="muted small-note ref-pic-help">{REF_MODE_INFO[mode]?.help}</div>}
      {image && (mode === 'pose' || mode === 'depth' || mode === 'kdepth') && (
        <label className="inline-label ref-pic-map">
          <input type="checkbox" checked={!!settings.showMap} onChange={e => set({ showMap: e.target.checked })} style={{ width: 'auto' }} />
          Show the {mode === 'pose' ? 'skeleton' : 'depth map'} the last image used
        </label>
      )}
    </div>
  )
}
