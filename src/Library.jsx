import { useEffect, useMemo, useState } from 'react'
import SeeMore, { useSeeMore } from './SeeMore.jsx'
import { useLightboxKeys } from './useLightboxKeys.js'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons.jsx'

// Gallery tab: every folder and gallery on this site in one place. It only READS the galleries (each tab still
// owns its pictures); "Open in …" jumps to the tab that has all the tools for a picture.
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

  async function load() {
    const out = {}
    for (const s of SOURCES) out[s.key] = (await readStore(s)).filter(r => r.blob).sort(newestFirst)
    setData(out)
  }
  useEffect(() => { if (active) load() }, [active])
  useEffect(() => {
    const again = () => { if (active) load() }
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

  // ---- one collection
  if (current) {
    const v = viewItem
    return (
      <div className="container library">
        <div className="lib-head">
          <button className="secondary lib-back" onClick={() => { setOpen(null); setViewIndex(-1) }}><ChevronLeftIcon size={18} /> All folders</button>
          <h1>{current.folder ? `📁 ${current.title}` : current.title} <span className="muted lib-count">· {items.length}</span></h1>
          <button className="secondary" onClick={() => openInTab(current)}
            title="Open it in its own tab, with all the tools (select, folders, delete, inpaint, upscale…)">Open in {current.source.label}</button>
        </div>
        {items.length === 0 ? <div className="empty-msg">Nothing here yet.</div> : (
          <div className="lib-grid">
            {visible.map((it, i) => (
              <button key={it.id} className="lib-tile" onClick={() => setViewIndex(i)} title={it.positive || it.prompt || ''}>
                <Media item={it} url={urls.get(it)} className="lib-thumb" />
                {isVideo(it) && <span className="lib-badge">▶</span>}
              </button>
            ))}
          </div>
        )}
        <SeeMore pager={pager} total={items.length} noun={current.source.noun} />

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
              <button className="secondary" onClick={() => download(v)}>Download</button>
              <button className="secondary" onClick={() => { setViewIndex(-1); openInTab(current) }}>Open in {current.source.label}</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- all collections
  const total = collections.reduce((n, c) => n + (c.folder ? 0 : c.items.length), 0)
  return (
    <div className="container library">
      <h1>Gallery</h1>
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
