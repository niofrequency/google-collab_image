import { useEffect, useMemo, useRef, useState } from 'react'
import SeeMore, { useSeeMore } from './SeeMore.jsx'
import { useLightboxKeys } from './useLightboxKeys.js'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ZoomIcon } from './icons.jsx'
import { galleryLayout, justifyRows, cellStyle, justifiedHeight } from './galleryLayout.js'
import { changeFoldersInDb, useShiftSelect } from './GalleryFolders.jsx'
import { askConfirm } from './ConfirmDialog.jsx'
import { cloudForget, queueSync } from './cloud.js'
import { detailLines, UPSCALER_NAMES } from './DetailTools.jsx'
import { removeDuplicates } from './dedupe.js'

// Gallery tab: every folder and gallery on this site in one place. Inside a folder it works like the Image Generator's
// gallery (select, Shift+click, select all, delete, folders, info, full-size viewer, sizes); "Open in …" jumps to the
// tab with all the tools for a picture. Changes are written to that tab's gallery and the tab is told to refresh.
const SOURCES = [
  { key: 'images', db: 'ImageGallery', store: 'images', label: 'Image Generator', tab: 'generate', noun: 'images' },
  { key: 'headswap', db: 'HeadSwapGallery', store: 'images', label: 'Head Swap', tab: 'headswap', noun: 'images' },
  { key: 'faceswap', db: 'FaceSwapGallery', store: 'images', label: 'Face Swap', tab: 'faceswap', noun: 'images' },
  { key: 'upscale', db: 'UpscaleGallery', store: 'items', label: 'Upscaled', tab: 'upscale', noun: 'items' },
  { key: 'videos', db: 'VideoGallery', store: 'videos', label: 'Videos', tab: 'video', noun: 'videos' },
]

// Reads one gallery. A gallery that was never created is simply empty (it is NOT created here, so the tab that
// owns it still sets it up properly the first time).
function readStore({ db, store }) {
  return new Promise(resolve => {
    const req = indexedDB.open(db, 1)
    req.onupgradeneeded = () => req.transaction.abort()
    req.onerror = () => resolve([])
    req.onsuccess = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(store)) { d.close(); return resolve([]) }
      const get = d.transaction(store, 'readonly').objectStore(store).getAll()
      get.onsuccess = () => { d.close(); resolve(get.result || []) }
      get.onerror = () => { d.close(); resolve([]) }
    }
  })
}

// Opens a gallery for changes (it exists: it has the items being changed)
function openStore({ db }) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(db, 1)
    req.onupgradeneeded = () => req.transaction.abort()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}
const CLOUD_KIND = { images: 'images', videos: 'videos' }   // galleries that cloud backup syncs

const isVideo = item => item.kind === 'video' || (item.blob?.type || '').startsWith('video/')
const newestFirst = (a, b) => (b.created || 0) - (a.created || 0)

function Media({ item, url, className, controls = false }) {
  if (!url) return <div className={`${className} lib-blank`} />
  return isVideo(item)
    ? <video className={className} src={url} muted playsInline preload="metadata" controls={controls} />
    : <img className={className} src={url} alt="" loading="lazy" />
}

export default function Library({ active }) {
  const [data, setData] = useState(null)        // { images: [...], headswap: [...], ... }
  const [open, setOpen] = useState(null)        // { source, folder? } — the collection being looked at
  const [viewIndex, setViewIndex] = useState(-1)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [infoItem, setInfoItem] = useState(null)
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem('library_thumb') || 200))
  const [fitImages, setFitImages] = useState(() => localStorage.getItem('library_fit') === '1')
  const [ratios, setRatios] = useState({})
  const [galleryWidth, setGalleryWidth] = useState(1000)
  const [folderMenu, setFolderMenu] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [msg, setMsg] = useState({ text: '', type: '' })
  const say = (text, type = '') => setMsg({ text, type })
  const gridRef = useRef(null)

  const [dupNote, setDupNote] = useState('')
  const deduping = useRef(false)
  async function load(dedupe = false) {
    if (dedupe && !deduping.current) {   // exact duplicates are removed automatically (see dedupe.js)
      deduping.current = true
      try {
        const removed = []
        for (const s of SOURCES) {
          const n = await removeDuplicates(s, CLOUD_KIND[s.key] || null)
          if (n) { removed.push(`${n} in ${s.label}`); window.dispatchEvent(new CustomEvent('gallery-changed', { detail: s.key })) }
        }
        setDupNote(removed.length ? `Removed duplicate copies: ${removed.join(', ')}.` : '')
      } finally { deduping.current = false }
    }
    const out = {}
    for (const s of SOURCES) out[s.key] = (await readStore(s)).filter(r => r.blob).sort(newestFirst)
    setData(out)
  }
  useEffect(() => { if (active) load(true) }, [active])
  useEffect(() => {
    const again = () => { if (active) load(true) }
    window.addEventListener('cloud-synced', again)
    return () => window.removeEventListener('cloud-synced', again)
  }, [active])

  // The collections: All images, each folder, then the other galleries
  const collections = useMemo(() => {
    if (!data) return []
    const imgs = data.images
    const folders = {}
    for (const it of imgs) for (const f of it.folders || []) (folders[f] ||= []).push(it)
    const list = imgs.length || !SOURCES.slice(1).some(src => data[src.key].length)
      ? [{ id: 'images', title: 'All images', sub: 'Image Generator', items: imgs, source: SOURCES[0] }] : []
    for (const name of Object.keys(folders).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
      list.push({ id: 'folder:' + name, title: name, sub: 'Folder', folder: name, items: folders[name], source: SOURCES[0] })
    }
    for (const s of SOURCES.slice(1)) {
      if (!data[s.key].length) continue
      list.push({ id: s.key, title: s.label, sub: 'Gallery', items: data[s.key], source: s })
      const fs = {}
      for (const it of data[s.key]) for (const f of it.folders || []) (fs[f] ||= []).push(it)
      for (const name of Object.keys(fs).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
        list.push({ id: `${s.key}:folder:${name}`, title: name, sub: `${s.label} folder`, folder: name, items: fs[name], source: s })
      }
    }
    return list
  }, [data])

  const current = open && collections.find(c => c.id === open)
  const items = current?.items || []
  const pager = useSeeMore(60, open)
  const visible = items.slice(0, pager.limit)
  const clickItem = useShiftSelect(visible.map(i => i.id), setSelectedIds)
  useEffect(() => { setSelectedIds(new Set()); setFolderMenu(false); setMsg({ text: '', type: '' }) }, [open])
  useEffect(() => {
    if (!active || !current || !gridRef.current) return
    const ro = new ResizeObserver(entries => setGalleryWidth(entries[0].contentRect.width))
    ro.observe(gridRef.current)
    return () => ro.disconnect()
  }, [active, open, !!current])   // eslint-disable-line react-hooks/exhaustive-deps

  // Changes go to the item's own gallery; then this view reloads and that tab refreshes
  const changed = key => { window.dispatchEvent(new CustomEvent('gallery-changed', { detail: key })); load() }
  async function deleteSelected() {
    const n = selectedIds.size
    const src = current.source
    if (!n || !(await askConfirm({ title: `Delete ${n} ${src.noun.replace(/s$/, '')}${n === 1 ? '' : 's'}?`,
      message: `They are removed from the ${src.label} gallery${CLOUD_KIND[src.key] ? ' (and from your cloud backup, if it is on)' : ''}. This can't be undone.`, yes: 'Delete' }))) return
    const ids = [...selectedIds]
    if (CLOUD_KIND[src.key]) await cloudForget(CLOUD_KIND[src.key], ids)
    const db = await openStore(src)
    await new Promise((resolve, reject) => {
      const tx = db.transaction(src.store, 'readwrite')
      for (const id of ids) tx.objectStore(src.store).delete(id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    setSelectedIds(new Set()); setViewIndex(-1)
    say(`Deleted ${n}`, 'ok')
    changed(src.key)
  }
  async function changeFolders(ids, change) {
    const src = current.source
    await changeFoldersInDb(() => openStore(src), src.store, ids, change)
    if (CLOUD_KIND[src.key]) queueSync(CLOUD_KIND[src.key])
    changed(src.key)
  }
  async function addToFolder(name) {
    name = (name || '').trim().slice(0, 60)
    if (!name || !selectedIds.size) return
    const n = selectedIds.size
    await changeFolders([...selectedIds], f => [...f, name])
    setSelectedIds(new Set()); setFolderMenu(false); setNewFolder('')
    say(`Added ${n} to the folder "${name}"`, 'ok')
  }
  async function removeFromFolder() {
    const n = selectedIds.size
    await changeFolders([...selectedIds], f => f.filter(x => x !== current.folder))
    setSelectedIds(new Set())
    say(`Removed ${n} from "${current.folder}" (still in ${current.source.label})`, 'ok')
  }
  const folderNamesOf = src => [...new Set((data?.[src.key] || []).flatMap(i => i.folders || []))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  // Object URLs only for what is on screen (the covers, or the open collection's page) — made once per page
  const urls = useMemo(() => {
    const need = current ? items.slice(0, pager.limit) : collections.map(c => c.items[0]).filter(Boolean)
    const map = new Map()
    for (const it of need) if (!map.has(it)) map.set(it, URL.createObjectURL(it.blob))
    return map
  }, [data, open, pager.limit])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const u of urls.values()) URL.revokeObjectURL(u) }, [urls])
  // the item in the full-size viewer (it may be past the shown page, when browsing with → )
  const viewItem = current && viewIndex >= 0 ? items[viewIndex] : null
  const viewUrl = useMemo(() => (viewItem && !urls.has(viewItem) ? URL.createObjectURL(viewItem.blob) : null), [viewItem, urls])
  useEffect(() => () => { if (viewUrl) URL.revokeObjectURL(viewUrl) }, [viewUrl])
  const urlOf = it => urls.get(it) || (it === viewItem ? viewUrl : null)

  useLightboxKeys(viewIndex >= 0, {
    prev: () => setViewIndex(i => Math.max(0, i - 1)),
    next: () => setViewIndex(i => Math.min(items.length - 1, i + 1)),
    close: () => setViewIndex(-1),
    enabled: active,
  })

  function openInTab(c) {
    window.dispatchEvent(new CustomEvent('go-to-tab', { detail: c.source.tab }))
    if (c.source.key === 'images') window.dispatchEvent(new CustomEvent('open-image-folder', { detail: c.folder || null }))
    else {
      const key = { headswap: 'headswap_gallery_folder', faceswap: 'faceswap_gallery_folder', upscale: 'upscale_gallery_folder', videos: 'video_gallery_folder' }[c.source.key]
      window.dispatchEvent(new CustomEvent('set-gallery-folder', { detail: { key, folder: c.folder || null } }))
    }
  }

  function download(item) {
    const a = document.createElement('a')
    a.href = urlOf(item) || URL.createObjectURL(item.blob)
    a.download = `${current?.source.key || 'image'}-${item.id}.${isVideo(item) ? 'mp4' : (item.blob.type.includes('jpeg') ? 'jpg' : 'png')}`
    a.click()
  }

  if (!data) return <div className="container"><h1>Gallery</h1><div className="muted">Loading…</div></div>

  // ---- one collection: the same gallery as the Image Generator's
  if (current) {
    const v = viewItem
    const src = current.source
    const layout = galleryLayout(galleryWidth, thumbSize)
    const tile = (it, i, cell) => (
      <div key={it.id} className={`gallery-item ${isVideo(it) ? 'video-tile' : ''} ${selectedIds.has(it.id) ? 'selected' : ''}`} style={cell}
        onClick={e => clickItem(e, it.id)} onDoubleClick={() => setViewIndex(i)}
        onMouseDown={e => { if (e.shiftKey) e.preventDefault() }}
        onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => {})}
        onMouseLeave={e => e.currentTarget.querySelector('video')?.pause()}>
        {isVideo(it)
          ? <video src={(urls.get(it) || '') + '#t=0.1'} muted loop playsInline preload="metadata" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }}
              onLoadedMetadata={e => { const { videoWidth: w, videoHeight: h } = e.currentTarget; if (w && h && !ratios[it.id]) setRatios(r => ({ ...r, [it.id]: w / h })) }} />
          : <img src={urls.get(it)} alt="" loading="lazy" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }}
              onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h && !ratios[it.id]) setRatios(r => ({ ...r, [it.id]: w / h })) }} />}
        {selectedIds.has(it.id) && <span className="selected-badge">✓</span>}
        {isVideo(it) && <span className="video-badge">▶{it.seconds ? ` ${it.seconds} s` : ''}</span>}
        <div className="gallery-overlay">
          <button className="magnify-btn" title="View full size" onClick={e => { e.stopPropagation(); setViewIndex(i) }}><ZoomIcon /></button>
        </div>
        <button className="info-btn" onClick={e => { e.stopPropagation(); setInfoItem(it) }}>i</button>
      </div>
    )
    const otherFolders = folderNamesOf(src)
    return (
      <div className="container library">
        <div className="lib-head">
          <button className="secondary lib-back" onClick={() => { setOpen(null); setViewIndex(-1) }}><ChevronLeftIcon size={18} /> All folders</button>
          <h1>{current.folder ? `📁 ${current.title}` : current.title} <span className="muted lib-count">· {items.length}</span></h1>
          <button className="secondary" onClick={() => openInTab(current)}
            title="Open it in its own tab, with all its tools (inpaint, upscale, use prompt…)">Open in {src.label}</button>
        </div>

        <div className="gallery-header">
          <h3 className="muted lib-sub">{current.sub}</h3>
          <div className="gallery-actions">
            {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
            {selectedIds.size > 0 && (
              <div className="folder-add">
                <button className="secondary" onClick={() => setFolderMenu(m => !m)} aria-expanded={folderMenu}>Add to folder ({selectedIds.size}) ▾</button>
                {folderMenu && (
                  <div className="folder-menu" role="menu">
                    {otherFolders.map(f => <button key={f} className="folder-menu-item" onClick={() => addToFolder(f)}>{f}</button>)}
                    <form className="folder-new" onSubmit={e => { e.preventDefault(); addToFolder(newFolder) }}>
                      <input autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="New folder name" maxLength={60} />
                      <button type="submit" disabled={!newFolder.trim()}>+ New folder</button>
                    </form>
                  </div>
                )}
              </div>
            )}
            {selectedIds.size > 0 && current.folder && <button className="secondary" onClick={removeFromFolder}>Remove from folder</button>}
            {items.length > 0 && (<>
              <label className="gallery-control" title="Thumbnail size">
                <span>Size</span>
                <input type="range" min="120" max="420" step="10" value={thumbSize}
                  onChange={e => { setThumbSize(+e.target.value); localStorage.setItem('library_thumb', e.target.value) }} />
              </label>
              <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole pictures instead of cropped squares"
                onClick={() => setFitImages(f => { localStorage.setItem('library_fit', f ? '0' : '1'); return !f })}>Full images</button>
              <div className={`select-all-box ${selectedIds.size === visible.length && visible.length > 0 ? 'checked' : ''}`} title="Select all shown"
                onClick={() => setSelectedIds(selectedIds.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))} />
            </>)}
          </div>
        </div>
        {msg.text && <div className={`status ${msg.type}`}>{msg.text}</div>}
        {items.length > 0 && <div className="gallery-hint"><span className="hint-mouse">Click to select · Shift+click to select a range · magnifier or double-click to view full size · ← → to browse</span><span className="hint-touch">Tap to select · tap the magnifier to view full size</span></div>}

        <div ref={gridRef}>
          {items.length === 0 ? <div className="empty-msg">Nothing here yet.</div> : !fitImages
            ? <div className="gallery" style={layout.grid}>{visible.map((it, i) => tile(it, i))}</div>
            : (() => {
              const gap = layout.narrow ? 6 : 12
              const rows = justifyRows(visible, it => (it.width && it.height ? it.width / it.height : ratios[it.id]), galleryWidth, justifiedHeight(layout, thumbSize), gap)
              return (
                <div className="gallery-justified" style={{ gap }}>
                  {rows.map((row, r) => (
                    <div key={r} className="gallery-row" style={{ gap, height: Math.round(row.height) }}>
                      {row.cells.map(cell => tile(cell.item, cell.index, cellStyle(row, cell)))}
                    </div>
                  ))}
                </div>
              )
            })()}
        </div>
        <SeeMore pager={pager} total={items.length} noun={src.noun} />

        {v && (
          <div className="lightbox" onClick={() => setViewIndex(-1)}>
            <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
              <button className="lb-btn left" title="Close (Esc)" onClick={() => setViewIndex(-1)}><CloseIcon /></button>
              <button className="lb-btn nav-left" onClick={() => setViewIndex(i => Math.max(0, i - 1))} disabled={viewIndex === 0} title="Previous (←)"><ChevronLeftIcon /></button>
              {isVideo(v) ? <video src={urlOf(v)} controls autoPlay playsInline className="lib-view-video" /> : <img src={urlOf(v)} alt="" />}
              <button className="lb-btn nav-right" onClick={() => setViewIndex(i => Math.min(items.length - 1, i + 1))} disabled={viewIndex === items.length - 1} title="Next (→)"><ChevronRightIcon /></button>
            </div>
            <div className="lb-bar" onClick={e => e.stopPropagation()}>
              <span className="lb-count">{viewIndex + 1} / {items.length}</span>
              <span className="lb-caption" title={v.positive || v.prompt || ''}>{v.positive || v.prompt || v.from || ''}</span>
              {v.width ? <span className="lb-meta">{v.width}×{v.height}</span> : null}
              <button className="secondary" onClick={() => setInfoItem(v)}>Info</button>
              <button className="secondary" onClick={() => download(v)}>Download</button>
              <button className="secondary" onClick={() => { setViewIndex(-1); openInTab(current) }}>Open in {src.label}</button>
            </div>
          </div>
        )}
        {infoItem && <ItemInfo item={infoItem} source={src} url={urlOf(infoItem) || urls.get(infoItem)} onClose={() => setInfoItem(null)} onDownload={() => download(infoItem)} />}
      </div>
    )
  }

  // ---- all collections
  const total = collections.reduce((n, c) => n + (c.folder ? 0 : c.items.length), 0)
  return (
    <div className="container library">
      <h1>Gallery</h1>
      {dupNote && <div className="status ok">{dupNote}</div>}
      <p className="muted">Everything you've made, by folder and gallery — {total} item{total === 1 ? '' : 's'}. Make folders in the Image Generator's gallery (select pictures → <b>Add to folder</b>).</p>
      {collections.length === 0 || total === 0 ? <div className="empty-msg">Nothing yet — make something in one of the tabs.</div> : (
        <div className="lib-folders">
          {collections.map(c => (
            <button key={c.id} className="lib-folder" onClick={() => { setOpen(c.id); setViewIndex(-1) }}>
              <div className="lib-cover">
                {c.items[0] ? <Media item={c.items[0]} url={urls.get(c.items[0])} className="lib-cover-media" /> : <div className="lib-cover-media lib-blank" />}
              </div>
              <div className="lib-folder-text">
                <strong>{c.folder ? `📁 ${c.title}` : c.title}</strong>
                <span className="muted">{c.sub} · {c.items.length}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The "i" popup in the Gallery tab: what a picture / video was made with (whatever its tab saved)
function ItemInfo({ item, source, url, onClose, onDownload }) {
  const [dims, setDims] = useState(null)
  useEffect(() => {
    if (!url || isVideo(item)) return
    const img = new Image()
    img.onload = () => setDims([img.naturalWidth, img.naturalHeight])
    img.src = url
  }, [url, item])
  const m = item.meta || {}
  const lines = []
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') lines.push([k, v]) }
  const w = item.width || dims?.[0], h = item.height || dims?.[1]
  add('Size', w ? `${w} × ${h}` : null)
  if (source.key === 'images') {
    add('Steps / CFG', item.steps ? `${item.steps} / ${item.cfg}` : null)
    add('Seed', item.seed)
    add('Sampler', item.sampler ? `${item.sampler} / ${item.scheduler}` : null)
    add('Checkpoint', item.checkpoint ? item.checkpoint.split('/').pop() : null)
    if (item.faceFix) add('Face fix', `strength ${item.faceStrength}${item.detail?.facePasses === 2 ? ', 2 passes' : ''}`)
    for (const l of item.loras || []) if (l.name) add('LoRA', `${l.name.split('/').pop()} · ${l.strength}`)
    for (const [k, v] of detailLines(item.detail)) add(k, v)
    if (item.faceRef) add('Face reference', `${{ faceid: 'FaceID', portrait: 'FaceID Portrait', pulid: 'PuLID', both: 'FaceID + PuLID', instantid: 'InstantID' }[item.faceRef.method] || 'FaceID'} · ${item.faceRef.character || `${item.faceRef.count} picture(s)`} · ${item.faceRef.strength}`)
    if (item.refPicture) add('Pose / style picture', `${item.refPicture.mode}${item.refPicture.denoise != null ? `, denoise ${item.refPicture.denoise}` : `, strength ${item.refPicture.strength}`}`)
    if (item.refiner) add('Refiner', `×${item.refiner.upscale}, strength ${item.refiner.strength}${item.refiner.upscaler ? ` · ${UPSCALER_NAMES[item.refiner.upscaler] || item.refiner.upscaler}` : ''}`)
  } else if (source.key === 'headswap' || source.key === 'faceswap') {
    add('Steps / CFG', m.steps != null && m.method !== 'insightface' ? `${m.fast ? '8 (Speed LoRA)' : m.steps}${m.cfg != null ? ` / ${m.cfg}` : ''}` : null)
    add('Seed', m.seed)
    add('Swap method', m.method && m.method !== 'bfs' ? (m.method === 'insightface' ? 'InsightFace face swap' : 'head swap + InsightFace') : null)
    add('Expression from body photo', m.expression ? `strength ${m.expression.strength}, ${m.expression.region}` : null)
    add('Face restore', m.restore ? `${m.restore.model}, visibility ${m.restore.visibility}` : null)
    for (const l of m.loras || []) add('LoRA', `${l.name.split('/').pop()} · ${l.strength}`)
    add('Took', m.seconds != null ? `${m.seconds} s` : null)
  } else if (source.key === 'upscale') {
    add('From', item.from)
    add('Upscaler', m.model ? (UPSCALER_NAMES[m.model] || m.model) : null)
    add('Face restore', m.faces ? `on (${m.faceStrength})` : (item.meta ? 'off' : null))
  } else if (source.key === 'videos') {
    add('Length', item.seconds ? `${item.seconds} s${item.frames ? ` (${item.frames} frames @ ${item.fps} fps)` : ''}` : null)
    add('Seed', item.seed)
    add('Model', item.model)
    add('Sound', item.sound ? (item.soundPrompt || 'yes') : null)
  }
  if (item.folders?.length) add('Folders', item.folders.join(', '))
  add('Made', item.created ? new Date(item.created).toLocaleString() : null)
  const prompt = item.positive ?? item.prompt
  return (
    <div className="prompt-popup-overlay" onClick={onClose}>
      <div className="prompt-popup" onClick={e => e.stopPropagation()}>
        <h3>{source.label} info</h3>
        {prompt != null && <p><strong>Prompt:</strong><br />{prompt || '(none)'}</p>}
        {item.negative ? <p><strong>Negative:</strong><br />{item.negative}</p> : null}
        <div className="meta-info">{lines.map(([k, v], i) => <span key={i}>{i > 0 && <br />}{k}: {String(v)}</span>)}</div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={onDownload}>Download</button>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
