import Info from './Info.jsx'

// BigLust "detail tools": extra passes for realistic photos. Each one is a switch; settings are remembered.
export const DEFAULT_DETAIL = {
  facePasses: 1,
  hand: false, handStrength: 0.4,
  eye: false, eyeStrength: 0.3,
  pag: false, pagScale: 2,
  dd: false, ddAmount: 0.2,
  tile: false, tileStrength: 0.6,
  restore: false, restoreFidelity: 0.7, restoreBlend: 0.4,
}

export const UPSCALER_NAMES = { lanczos: 'Simple resize', ultrasharp: '4x-UltraSharp', nomos8kdat: '4xNomos8kDAT' }

export function loadDetail() {
  try { return { ...DEFAULT_DETAIL, ...(JSON.parse(localStorage.getItem('detail_tools')) || {}) } } catch { return { ...DEFAULT_DETAIL } }
}

// The request fields for the BigLust server (only what's switched on and supported)
export function detailPayload(d, tools, { faceFix, refinerOn }) {
  if (!tools) return {}
  return {
    ...(tools.face_fix_passes && faceFix ? { face_fix_passes: +d.facePasses === 2 ? 2 : 1 } : {}),
    ...(tools.hand_fix && d.hand ? { hand_fix: true, hand_fix_strength: +d.handStrength } : {}),
    ...(tools.eye_fix && d.eye ? { eye_fix: true, eye_fix_strength: +d.eyeStrength } : {}),
    ...(tools.pag && d.pag ? { pag_scale: +d.pagScale } : {}),
    ...(tools.detail_daemon && d.dd ? { detail_daemon: +d.ddAmount } : {}),
    ...(tools.refiner_tile && d.tile && refinerOn ? { refiner_tile: true, refiner_tile_strength: +d.tileStrength } : {}),
    ...(tools.face_restore && d.restore ? { face_restore: true, face_restore_fidelity: +d.restoreFidelity, face_restore_blend: +d.restoreBlend } : {}),
  }
}

// What was used, saved with each image (for the gallery's info and "Load Full")
export function detailRecord(p) {
  const r = {}
  if (p.face_fix_passes === 2) r.facePasses = 2
  if (p.eye_fix) r.eye = +p.eye_fix_strength
  if (p.hand_fix) r.hand = +p.hand_fix_strength
  if (p.pag_scale) r.pag = +p.pag_scale
  if (p.detail_daemon) r.dd = +p.detail_daemon
  if (p.refiner && p.refiner_tile) r.tile = +p.refiner_tile_strength
  if (p.refiner && p.refiner_upscaler) r.upscaler = p.refiner_upscaler
  if (p.face_restore) r.restore = { fidelity: +p.face_restore_fidelity, mix: +p.face_restore_blend }
  return Object.keys(r).length ? r : null
}

// One line per tool for the gallery's info
export function detailLines(r) {
  if (!r) return []
  const out = []
  if (r.eye != null) out.push(['Eye detail', `strength ${r.eye}`])
  if (r.hand != null) out.push(['Hand fix', `strength ${r.hand}`])
  if (r.pag != null) out.push(['PAG', `scale ${r.pag}`])
  if (r.dd != null) out.push(['Detail Daemon', `amount ${r.dd}`])
  if (r.tile != null) out.push(['Tile detail', `strength ${r.tile}`])
  if (r.restore) out.push(['CodeFormer', `fidelity ${r.restore.fidelity}, mix ${Math.round(r.restore.mix * 100)}%`])
  return out
}

// Settings for the Detail tools box from a saved record ("Load Full")
export function detailFromRecord(r) {
  return {
    facePasses: r?.facePasses === 2 ? 2 : 1,
    eye: r?.eye != null, ...(r?.eye != null ? { eyeStrength: r.eye } : {}),
    hand: r?.hand != null, ...(r?.hand != null ? { handStrength: r.hand } : {}),
    pag: r?.pag != null, ...(r?.pag != null ? { pagScale: r.pag } : {}),
    dd: r?.dd != null, ...(r?.dd != null ? { ddAmount: r.dd } : {}),
    tile: r?.tile != null, ...(r?.tile != null ? { tileStrength: r.tile } : {}),
    restore: !!r?.restore, ...(r?.restore ? { restoreFidelity: r.restore.fidelity, restoreBlend: r.restore.mix } : {}),
  }
}

// A short summary for the gallery's info (what was used) — older images
export function detailSummary(p) {
  const out = []
  if (p.face_fix_passes === 2) out.push('face fix 2 passes')
  if (p.eye_fix) out.push(`eye detail ${p.eye_fix_strength}`)
  if (p.hand_fix) out.push(`hand fix ${p.hand_fix_strength}`)
  if (p.pag_scale) out.push(`PAG ${p.pag_scale}`)
  if (p.detail_daemon) out.push(`Detail Daemon ${p.detail_daemon}`)
  if (p.refiner && p.refiner_upscaler && p.refiner_upscaler !== 'lanczos') out.push(`enlarged with ${UPSCALER_NAMES[p.refiner_upscaler] || p.refiner_upscaler}`)
  if (p.refiner_tile) out.push(`tile detail ${p.refiner_tile_strength}`)
  if (p.face_restore) out.push(`CodeFormer ${p.face_restore_fidelity} / ${Math.round(p.face_restore_blend * 100)}%`)
  return out
}

function Num({ value, onChange, min, max, step = 0.05, label }) {
  return (
    <label className="inline-label">{label}
      <input type="number" step={step} min={min} max={max} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

export default function DetailTools({ value, setValue, tools, faceFix, refinerOn, poseReader, modelName }) {
  const d = value
  const set = patch => setValue(prev => { const next = { ...prev, ...patch }; localStorage.setItem('detail_tools', JSON.stringify(next)); return next })
  const off = !tools
  const sdxlOnly = modelName && !/SDXL/.test(modelName)   // e.g. Krea 2: PAG, Detail Daemon and Tile are SDXL-only
  const need = sdxlOnly ? `Not available with ${modelName} (SDXL / BigLust only)` : 'Needs the updated notebook — open it fresh from GitHub and run cells 1–3'
  // Not connected: show the setting as it is (dimmed). Connected to a notebook without the tool: Off (it isn't used).
  const T = (key, on, label, onClick, title) => {
    const shownOn = on && (off || tools[key])
    return (
      <button className={`toggle small ${shownOn ? 'on' : ''}`} disabled={off || !tools[key]}
        title={off ? 'Connect the BigLust notebook to use it' : !tools[key] ? need : title} onClick={onClick}>{label}: {shownOn ? 'On' : 'Off'}</button>
    )
  }
  return (
    <div className="detail-tools">
      <div className="inline" style={{ alignItems: 'center' }}>
        <strong className="detail-title">Detail tools</strong>
        <Info text={sdxlOnly ? <>Extra passes for <b>realistic photos</b>, redrawn by <b>{modelName}</b>. Each one takes a little longer; their models download the first time you use them.<br /><br />
          <b>Face fix 2 passes</b>: a second, lighter face fix after the first — often more likeness with fewer seams. With Face reference (Identity Edit) on, both passes follow your face photo.<br />
          <b>Eye detail</b>: the eye area of each face redrawn lightly at full size — sharp iris, catchlights. 0.25–0.35.<br />
          <b>Hand fix</b>: finds the hands and redraws them at full size (like face fix) — fewer extra / fused fingers. 0.35–0.5.<br />
          <b>CodeFormer</b>: the last step — cleans up eyes, teeth and skin of every face. <i>Fidelity</i> 0 = strongest cleanup … 1 = closest to the face (0.7). <i>Mix</i> = how much of it is blended in (40% keeps it natural).<br /><br />
          PAG, Detail Daemon and Tile detail are BigLust (SDXL) tools, so they're greyed out here.</> : <>Extra passes for <b>realistic photos</b>. Each one takes a little longer; their models download the first time you use them (and are kept in your Google Drive cache if it's on).<br /><br />
          <b>Face fix 2 passes</b>: a second, lighter face fix after the first — often more likeness with fewer seams (great with InstantID).<br />
          <b>Eye detail</b>: the eye area of each face redrawn lightly at full size — sharp iris, catchlights. 0.25–0.35.<br />
          <b>Hand fix</b>: finds the hands and redraws them at full size (like face fix) — fewer extra / fused fingers. 0.35–0.5.<br />
          <b>PAG</b> (Perturbed-Attention Guidance): sharper structure, fewer mushy details; each step ~30% slower. 1.5–3.<br />
          <b>Detail Daemon</b>: in the middle steps the model is told there's a bit less noise, so it keeps more fine detail (skin, hair, fabric) instead of smoothing it away. No extra time. 0.1 subtle · 0.2 default · 0.3–0.4 strong (too high looks gritty).<br />
          <b>Tile detail</b> (with the Refiner on): the Tile ControlNet holds the picture so the refiner can add real detail — skin pores, hair strands, fabric — without changing the face. Raise the refiner's strength to 0.4–0.5 with it. Tile 0.5–0.7.<br />
          <b>CodeFormer</b>: the last step — cleans up eyes, teeth and skin of every face. <i>Fidelity</i> 0 = strongest cleanup … 1 = closest to the face (0.7). <i>Mix</i> = how much of it is blended in (40% keeps it natural).<br /><br />
          Pose pictures are read with <b>{poseReader === 'dwpose' ? 'DWPose' : 'OpenPose'}</b>{poseReader === 'dwpose' ? ' (much better hands and fingers)' : ' — the updated notebook uses DWPose (better hands)'}.</>} />
      </div>
      <div className="detail-grid">
        {faceFix && tools?.face_fix_passes && (
          <div className="detail-item">
            <button className={`toggle small ${+d.facePasses === 2 ? 'on' : ''}`} onClick={() => set({ facePasses: +d.facePasses === 2 ? 1 : 2 })}
              title="A second, lighter face fix pass">Face fix 2 passes: {+d.facePasses === 2 ? 'On' : 'Off'}</button>
          </div>
        )}
        <div className="detail-item">
          {T('eye_fix', d.eye, 'Eye detail', () => set({ eye: !d.eye }), 'Redraw the eyes sharp')}
          {d.eye && tools?.eye_fix && <Num label="Strength" value={d.eyeStrength} min={0.1} max={0.6} onChange={v => set({ eyeStrength: v })} />}
        </div>
        <div className="detail-item">
          {T('hand_fix', d.hand, 'Hand fix', () => set({ hand: !d.hand }), 'Redraw hands at full size')}
          {d.hand && tools?.hand_fix && <Num label="Strength" value={d.handStrength} min={0.1} max={0.8} onChange={v => set({ handStrength: v })} />}
        </div>
        <div className="detail-item">
          {T('pag', d.pag, 'PAG', () => set({ pag: !d.pag }), 'Sharper structure')}
          {d.pag && tools?.pag && <Num label="Scale" value={d.pagScale} min={0.5} max={5} step={0.25} onChange={v => set({ pagScale: v })} />}
        </div>
        <div className="detail-item">
          {T('detail_daemon', d.dd, 'Detail Daemon', () => set({ dd: !d.dd }), 'Keep more fine detail (skin, hair, fabric)')}
          {d.dd && tools?.detail_daemon && <Num label="Amount" value={d.ddAmount} min={0.05} max={0.6} onChange={v => set({ ddAmount: v })} />}
        </div>
        <div className="detail-item">
          {T('refiner_tile', d.tile, 'Tile detail', () => set({ tile: !d.tile }), 'With the Refiner: add real detail without changing the picture')}
          {d.tile && tools?.refiner_tile && <Num label="Tile" value={d.tileStrength} min={0.1} max={1} onChange={v => set({ tileStrength: v })} />}
          {d.tile && tools?.refiner_tile && !refinerOn && <span className="muted small-note">turn the Refiner on to use it</span>}
        </div>
        <div className="detail-item">
          {T('face_restore', d.restore, 'CodeFormer', () => set({ restore: !d.restore }), 'Clean up faces at the end')}
          {d.restore && tools?.face_restore && <>
            <Num label="Fidelity" value={d.restoreFidelity} min={0} max={1} step={0.1} onChange={v => set({ restoreFidelity: v })} />
            <Num label="Mix" value={d.restoreBlend} min={0.05} max={1} step={0.05} onChange={v => set({ restoreBlend: v })} />
          </>}
        </div>
      </div>
    </div>
  )
}
