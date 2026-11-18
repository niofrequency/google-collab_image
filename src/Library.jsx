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

// What an item is tagged with: the character used to make it (saved by the Image Generator and Head / Face Swap)
export function characterOf(rec) {
  const c = rec.character || rec.faceRef?.character || rec.meta?.character
  return typeof c === 'string' && c.trim() ? c.trim().replace(/\s+/g, ' ') : null
}

export default function Library({ active }) {
  const [data, setData] = useState(null)        // { images: [...], headswap: [...], ... } (records as stored)
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState(null)     // folder filter (a folder name: across every gallery)
  const [character, setCharacter] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [viewIndex, setViewIndex] = useState(-1)
  const [selected, setSelected] = useState(new Set())   // keys: "<source>:<id>"
  const [infoEntry, setInfoEntry] = useState(null)
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem('library_thumb') || 200))
  const [fitImages, setFitImages] = useState(() => localStorage.getItem('library_fit') === '1')
  const [ratios, setRatios] = useState({})
  const [galleryWidth, setGalleryWidth] = useState(1000)
  const [folderMenu, setFolderMenu] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [msg, setMsg] = useState({ text: '', type: '' })
  const say = (text, type = '') => setMsg({ text, type })
  const gridRef = useRef(null)
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
        if (removed.length) say(`Removed duplicate copies: ${removed.join(', ')}.`, 'ok')
      } finally { deduping.current = false }
    }
    const out = {}
    for (const s of SOURCES) out[s.key] = (await readStore(s)).filter(r => r.blob)
    setData(out)
  }
  useEffect(() => { if (active) load(true) }, [active])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const again = () => { if (active) load(true) }
    window.addEventListener('cloud-synced', again)
    return () => window.removeEventListener('cloud-synced', again)
  }, [active])   // eslint-disable-line react-hooks/exhaustive-deps

  // Everything, newest first, with its tags
  const entries = useMemo(() => {
    if (!data) return []
    const out = []
    const spelling = new Map()   // "anna" -> "Anna": one tag per character whatever the capitalisation
    for (const src of SOURCES) for (const rec of data[src.key]) {
      let character = characterOf(rec)
      if (character) {
        const k = character.toLowerCase()
        const had = spelling.get(k)   // prefer a capitalised spelling ("Anna" over "anna")
        if (!had || (had[0] === had[0].toLowerCase() && character[0] !== character[0].toLowerCase())) spelling.set(k, character)
      }
      out.push({ key: `${src.key}:${rec.id}`, src, rec, character, folders: rec.folders || [] })
    }
    for (const e of out) if (e.character) e.character = spelling.get(e.character.toLowerCase())
    return out.sort((a, b) => (b.rec.created || 0) - (a.rec.created || 0))
  }, [data])
  const count = (list, f) => { const m = {}; for (const e of list) for (const v of f(e)) m[v] = (m[v] || 0) + 1; return m }
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  const folderCounts = useMemo(() => count(entries, e => e.folders), [entries])
  const characterCounts = useMemo(() => count(entries, e => (e.character ? [e.character] : [])), [entries])
  const folderNames = Object.keys(folderCounts).sort(byName)
  const characterNames = Object.keys(characterCounts).sort(byName)
  const activeFolder = folder && folderCounts[folder] ? folder : null
  const activeCharacter = character && characterCounts[character] ? character : null

  // Search: every word must appear in the character, folders, prompt, gallery name, checkpoint or model
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return entries.filter(e => {
      if (activeFolder && !e.folders.includes(activeFolder)) return false
      if (activeCharacter && e.character !== activeCharacter) return false
      if (!words.length) return true
      const r = e.rec
      const text = [e.character, ...e.folders, r.positive, r.prompt, r.meta?.prompt, e.src.label, r.checkpoint, r.model, r.from]
        .filter(Boolean).join(' ').toLowerCase()
      return words.every(w => text.includes(w))
    })
  }, [entries, query, activeFolder, activeCharacter])
  const pager = useSeeMore(60, `${query}|${activeFolder}|${activeCharacter}`)
  const visible = shown.slice(0, pager.limit)
  const setSelectedIds = setSelected
  const clickItem = useShiftSelect(visible.map(e => e.key), setSelectedIds)
  useEffect(() => { setSelected(new Set()); setViewIndex(-1); setFolderMenu(false) }, [query, activeFolder, activeCharacter])
  useEffect(() => {
    if (!active || !gridRef.current) return
    const ro = new ResizeObserver(es => setGalleryWidth(es[0].contentRect.width))
    ro.observe(gridRef.current)
    return () => ro.disconnect()
  }, [active, !!data])   // eslint-disable-line react-hooks/exhaustive-deps

  // Object URLs only for what's on screen
  const urls = useMemo(() => {
    const map = new Map()
    for (const e of visible) map.set(e.key, URL.createObjectURL(e.rec.blob))
    return map
  }, [data, query, activeFolder, activeCharacter, pager.limit])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const u of urls.values()) URL.revokeObjectURL(u) }, [urls])
  const viewEntry = viewIndex >= 0 ? shown[viewIndex] : null
  const viewUrl = useMemo(() => (viewEntry && !urls.has(viewEntry.key) ? URL.createObjectURL(viewEntry.rec.blob) : null), [viewEntry, urls])
  useEffect(() => () => { if (viewUrl) URL.revokeObjectURL(viewUrl) }, [viewUrl])
  const urlOf = e => urls.get(e.key) || (e === viewEntry ? viewUrl : null)

  useLightboxKeys(viewIndex >= 0, {
    prev: () => setViewIndex(i => Math.max(0, i - 1)),
    next: () => setViewIndex(i => Math.min(shown.length - 1, i + 1)),
    close: () => setViewIndex(-1),
    enabled: active && !infoEntry,
  })

  // ---- changes: written to each item's own gallery (and cloud backup); that tab refreshes
  const bySource = keys => {
    const groups = new Map()
    for (const e of entries) if (keys.has(e.key)) (groups.get(e.src) || groups.set(e.src, []).get(e.src)).push(e.rec.id)
    return groups
  }
  const afterChange = srcs => { for (const s of srcs) window.dispatchEvent(new CustomEvent('gallery-changed', { detail: s.key })); load() }
  async function deleteSelected() {
    const n = selected.size
    if (!n || !(await askConfirm({ title: `Delete ${n} item${n === 1 ? '' : 's'}?`, message: 'They are removed from their galleries (and from your cloud backup, if it is on). This can\'t be undone.', yes: 'Delete' }))) return
    const groups = bySource(selected)
    for (const [src, ids] of groups) {
      if (CLOUD_KIND[src.key]) await cloudForget(CLOUD_KIND[src.key], ids)
      const db = await openStore(src)
      await new Promise(resolve => { const tx = db.transaction(src.store, 'readwrite'); for (const id of ids) tx.objectStore(src.store).delete(id); tx.oncomplete = resolve; tx.onerror = resolve })
      db.close()
    }
    setSelected(new Set()); setViewIndex(-1)
    say(`Deleted ${n}`, 'ok')
    afterChange(groups.keys())
  }
  async function changeFolders(keys, change) {
    const groups = bySource(keys)
    for (const [src, ids] of groups) {
      await changeFoldersInDb(() => openStore(src), src.store, ids, change)
      if (CLOUD_KIND[src.key]) queueSync(CLOUD_KIND[src.key])
    }
    afterChange(groups.keys())
  }
  async function addToFolder(name) {
    name = (name || '').trim().slice(0, 60)
    if (!name || !selected.size) return
    const n = selected.size
    await changeFolders(selected, f => [...f, name])
    setSelected(new Set()); setFolderMenu(false); setNewFolder('')
    say(`Added ${n} to the folder "${name}"`, 'ok')
  }
  // Each selected item that has a character goes into a folder named after that character
  async function sortByCharacter() {
    const picked = entries.filter(e => selected.has(e.key) && e.character)
    if (!picked.length) { say('None of the selected items has a character saved (only pictures made with a character are tagged).', 'error'); return }
    // exact duplicate pictures are removed first, so each picture lands in its folder once
    for (const s of new Set(picked.map(e => e.src))) await removeDuplicates(s, CLOUD_KIND[s.key] || null)
    const names = [...new Set(picked.map(e => e.character))]
    for (const name of names) {
      // reuse a folder that already exists with the same name in other capitalisation ("anna" -> "Anna")
      const folderName = folderNames.find(f => f.toLowerCase() === name.toLowerCase()) || name.slice(0, 60)
      const keys = new Set(picked.filter(e => e.character === name).map(e => e.key))
      await changeFolders(keys, f => (f.includes(folderName) ? f : [...f, folderName]))   // never twice in one folder
    }
    const skipped = selected.size - picked.length
    setSelected(new Set())
    say(`Sorted ${picked.length} into ${names.length} character folder${names.length === 1 ? '' : 's'}: ${names.join(', ')}${skipped ? ` (${skipped} without a character left as they are)` : ''}`, 'ok')
  }
  async function removeFromFolder() {
    const n = selected.size
    await changeFolders(selected, f => f.filter(x => x !== activeFolder))
    setSelected(new Set())
    say(`Removed ${n} from "${activeFolder}" (still in All)`, 'ok')
  }
  async function renameFolder(oldName, newName) {
    setRenaming(null)
    const name = (newName || '').trim().slice(0, 60)
    if (!name || name === oldName) return
    await changeFolders(new Set(entries.filter(e => e.folders.includes(oldName)).map(e => e.key)), f => f.map(x => (x === oldName ? name : x)))
    setFolder(name)
    say(`Folder renamed to "${name}"`, 'ok')
  }
  async function deleteFolder(name) {
    const keys = new Set(entries.filter(e => e.folders.includes(name)).map(e => e.key))
    if (!(await askConfirm({ title: `Delete the folder "${name}"?`, message: `Only the folder goes away — its ${keys.size} item${keys.size === 1 ? '' : 's'} stay in All.`, yes: 'Delete folder' }))) return
    await changeFolders(keys, f => f.filter(x => x !== name))
    setFolder(null)
    say(`Folder "${name}" deleted — its items are still in All`, 'ok')
  }

  function openInTab(e) {
    window.dispatchEvent(new CustomEvent('go-to-tab', { detail: e.src.tab }))
    const f = activeFolder && e.folders.includes(activeFolder) ? activeFolder : null
    if (e.src.key === 'images') window.dispatchEvent(new CustomEvent('open-image-folder', { detail: f }))
    else {
      const key = { headswap: 'headswap_gallery_folder', faceswap: 'faceswap_gallery_folder', upscale: 'upscale_gallery_folder', videos: 'video_gallery_folder' }[e.src.key]
      window.dispatchEvent(new CustomEvent('set-gallery-folder', { detail: { key, folder: f } }))
    }
  }
  function download(e) {
    const a = document.createElement('a')
    a.href = urlOf(e) || URL.createObjectURL(e.rec.blob)
    a.download = `${e.src.key}-${e.rec.id}.${isVideo(e.rec) ? 'mp4' : (e.rec.blob.type.includes('jpeg') ? 'jpg' : 'png')}`
    a.click()
  }

  if (!data) return <div className="container"><h1>Gallery</h1><div className="muted">Loading…</div></div>

  const layout = galleryLayout(galleryWidth, thumbSize)
  const tile = (e, i, cell) => {
    const it = e.rec
    return (
      <div key={e.key} className={`gallery-item ${isVideo(it) ? 'video-tile' : ''} ${selected.has(e.key) ? 'selected' : ''}`} style={cell}
        onClick={ev => clickItem(ev, e.key)} onDoubleClick={() => setViewIndex(i)}
        onMouseDown={ev => { if (ev.shiftKey) ev.preventDefault() }}
        onMouseEnter={ev => ev.currentTarget.querySelector('video')?.play().catch(() => {})}
        onMouseLeave={ev => ev.currentTarget.querySelector('video')?.pause()}>
        {isVideo(it)
          ? <video src={(urls.get(e.key) || '') + '#t=0.1'} muted loop playsInline preload="metadata" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }}
              onLoadedMetadata={ev => { const { videoWidth: w, videoHeight: h } = ev.currentTarget; if (w && h && !ratios[e.key]) setRatios(r => ({ ...r, [e.key]: w / h })) }} />
          : <img src={urls.get(e.key)} alt="" loading="lazy" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }}
              onLoad={ev => { const { naturalWidth: w, naturalHeight: h } = ev.currentTarget; if (w && h && !ratios[e.key]) setRatios(r => ({ ...r, [e.key]: w / h })) }} />}
        {selected.has(e.key) && <span className="selected-badge">✓</span>}
        {isVideo(it) && <span className="video-badge">▶{it.seconds ? ` ${it.seconds} s` : ''}</span>}
        {e.character && <span className="lib-tag" title={`Character: ${e.character}`}>👤 {e.character}</span>}
        <div className="gallery-overlay">
          <button className="magnify-btn" title="View full size" onClick={ev => { ev.stopPropagation(); setViewIndex(i) }}><ZoomIcon /></button>
        </div>
        <button className="info-btn" onClick={ev => { ev.stopPropagation(); setInfoEntry(e) }}>i</button>
      </div>
    )
  }
  const v = viewEntry
  const total = entries.length
  return (
    <div className="container library">
      <h1>Gallery <span className="muted lib-count">· {total}</span></h1>

      <div className="lib-search">
        <input type="search" value={query} onChange={ev => setQuery(ev.target.value)} placeholder="Search characters, folders, prompts…" aria-label="Search the gallery" />
        {(query || activeFolder || activeCharacter) && <button className="secondary" onClick={() => { setQuery(''); setFolder(null); setCharacter(null) }}>Clear</button>}
      </div>

      <div className="lib-menu">
        <div className="folder-bar" role="tablist" aria-label="Folders">
          <span className="chips-label">Folders</span>
          <button className={`chip ${!activeFolder ? 'active' : ''}`} onClick={() => setFolder(null)}>All <span className="folder-count">{total}</span></button>
          {folderNames.map(f => (
            <span key={f} className="folder-chip">
              <button className={`chip ${activeFolder === f ? 'active' : ''}`} onClick={() => setFolder(activeFolder === f ? null : f)}>📁 {f} <span className="folder-count">{folderCounts[f]}</span></button>
              {activeFolder === f && renaming?.from === f && (
                <form className="folder-rename" onSubmit={ev => { ev.preventDefault(); renameFolder(f, renaming.to) }}>
                  <input autoFocus value={renaming.to} maxLength={60} onChange={ev => setRenaming({ from: f, to: ev.target.value })} onKeyDown={ev => ev.key === 'Escape' && setRenaming(null)} aria-label="New folder name" />
                  <button type="submit" className="chip active">Save</button>
                  <button type="button" className="chip" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              )}
              {activeFolder === f && renaming?.from !== f && (<>
                <button className="chip folder-tool" title="Rename this folder" onClick={() => setRenaming({ from: f, to: f })}>✎</button>
                <button className="chip folder-tool" title="Delete this folder (the items stay)" onClick={() => deleteFolder(f)}>×</button>
              </>)}
            </span>
          ))}
          {!folderNames.length && <span className="muted small-note">Select pictures → Add to folder</span>}
        </div>
        {characterNames.length > 0 && (
          <div className="folder-bar" role="tablist" aria-label="Characters">
            <span className="chips-label">Characters</span>
            {characterNames.map(c => (
              <button key={c} className={`chip ${activeCharacter === c ? 'active' : ''}`} onClick={() => setCharacter(activeCharacter === c ? null : c)}
                title={`Everything made with the character "${c}"`}>👤 {c} <span className="folder-count">{characterCounts[c]}</span></button>
            ))}
          </div>
        )}
      </div>

      <div className="gallery-header">
        <h3>{activeFolder ? `📁 ${activeFolder}` : activeCharacter ? `👤 ${activeCharacter}` : query ? 'Search results' : 'All'} <span className="muted">· {shown.length}</span></h3>
        <div className="gallery-actions">
          {selected.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selected.size})</button>}
          {selected.size > 0 && (
            <div className="folder-add">
              <button className="secondary" onClick={() => setFolderMenu(m => !m)} aria-expanded={folderMenu}>Add to folder ({selected.size}) ▾</button>
              {folderMenu && (
                <div className="folder-menu" role="menu">
                  {folderNames.map(f => <button key={f} className="folder-menu-item" onClick={() => addToFolder(f)}>{f} <span className="muted">{folderCounts[f]}</span></button>)}
                  <form className="folder-new" onSubmit={ev => { ev.preventDefault(); addToFolder(newFolder) }}>
                    <input autoFocus value={newFolder} onChange={ev => setNewFolder(ev.target.value)} placeholder="New folder name" maxLength={60} />
                    <button type="submit" disabled={!newFolder.trim()}>+ New folder</button>
                  </form>
                </div>
              )}
            </div>
          )}
          {selected.size > 0 && characterNames.length > 0 && <button className="secondary" onClick={sortByCharacter}
            title="Put each selected picture into a folder named after its character">👤 Sort into character folders</button>}
          {selected.size > 0 && activeFolder && <button className="secondary" onClick={removeFromFolder}>Remove from folder</button>}
          {shown.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="120" max="420" step="10" value={thumbSize} onChange={ev => { setThumbSize(+ev.target.value); localStorage.setItem('library_thumb', ev.target.value) }} />
            </label>
            <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole pictures instead of cropped squares"
              onClick={() => setFitImages(f => { localStorage.setItem('library_fit', f ? '0' : '1'); return !f })}>Full images</button>
            <div className={`select-all-box ${selected.size === visible.length && visible.length > 0 ? 'checked' : ''}`} title="Select all shown"
              onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map(e => e.key)))} />
          </>)}
        </div>
      </div>
      {msg.text && <div className={`status ${msg.type}`}>{msg.text}</div>}
      {shown.length > 0 && <div className="gallery-hint"><span className="hint-mouse">Click to select · Shift+click to select a range · magnifier or double-click to view full size · ← → to browse</span><span className="hint-touch">Tap to select · tap the magnifier to view full size</span></div>}

      <div ref={gridRef}>
        {total === 0 ? <div className="empty-msg">Nothing yet — make something in one of the tabs.</div>
          : shown.length === 0 ? <div className="empty-msg">Nothing matches{query ? ` "${query}"` : ''}.</div>
          : !fitImages ? <div className="gallery" style={layout.grid}>{visible.map((e, i) => tile(e, i))}</div>
          : (() => {
            const gap = layout.narrow ? 6 : 12
            const rows = justifyRows(visible, e => (e.rec.width && e.rec.height ? e.rec.width / e.rec.height : ratios[e.key]), galleryWidth, justifiedHeight(layout, thumbSize), gap)
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
      <SeeMore pager={pager} total={shown.length} noun="items" />

      {v && (
        <div className="lightbox" onClick={() => setViewIndex(-1)}>
          <div className="lb-image-wrap" onClick={ev => ev.stopPropagation()}>
            <button className="lb-btn left" title="Close (Esc)" onClick={() => setViewIndex(-1)}><CloseIcon /></button>
            <button className="lb-btn nav-left" onClick={() => setViewIndex(i => Math.max(0, i - 1))} disabled={viewIndex === 0} title="Previous (←)"><ChevronLeftIcon /></button>
            {isVideo(v.rec) ? <video src={urlOf(v)} controls autoPlay playsInline className="lib-view-video" /> : <img src={urlOf(v)} alt="" />}
            <button className="lb-btn nav-right" onClick={() => setViewIndex(i => Math.min(shown.length - 1, i + 1))} disabled={viewIndex === shown.length - 1} title="Next (→)"><ChevronRightIcon /></button>
          </div>
          <div className="lb-bar" onClick={ev => ev.stopPropagation()}>
            <span className="lb-count">{viewIndex + 1} / {shown.length}</span>
            <span className="lb-caption" title={v.rec.positive || v.rec.prompt || ''}>{v.character ? `👤 ${v.character} · ` : ''}{v.rec.positive || v.rec.prompt || v.rec.from || ''}</span>
            {v.rec.width ? <span className="lb-meta">{v.rec.width}×{v.rec.height}</span> : null}
            <button className="secondary" onClick={() => setInfoEntry(v)}>Info</button>
            <button className="secondary" onClick={() => download(v)}>Download</button>
            <button className="secondary" onClick={() => { setViewIndex(-1); openInTab(v) }}>Open in {v.src.label}</button>
          </div>
        </div>
      )}
      {infoEntry && <ItemInfo item={infoEntry.rec} source={infoEntry.src} character={infoEntry.character} url={urlOf(infoEntry)}
        onClose={() => setInfoEntry(null)} onDownload={() => download(infoEntry)} onOpen={() => { setInfoEntry(null); openInTab(infoEntry) }} />}
    </div>
  )
}

// The "i" popup in the Gallery tab: what a picture / video was made with (whatever its tab saved)
function ItemInfo({ item, source, character, url, onClose, onDownload, onOpen }) {
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
  add('Made in', source.label)
  add('Character', character)
  add('Size', w ? `${w} × ${h}` : null)
  if (source.key === 'images') {
    add('Model', { sdxl: 'BigLust (SDXL)', krea2: 'Krea 2', qwen_image_edit: 'Qwen Edit' }[item.model] || null)
    add('Steps / CFG', item.steps ? `${item.steps} / ${item.cfg}` : null)
    add('Seed', item.seed)
    add('Variation', item.variation ? `seed ${item.variation.seed} at ${item.variation.strength}` : null)
    add('Sampler', item.sampler ? `${item.sampler} / ${item.scheduler}` : null)
    add('Checkpoint', item.checkpoint ? item.checkpoint.split('/').pop() : null)
    if (item.faceFix) add('Face fix', `strength ${item.faceStrength}${item.detail?.facePasses === 2 ? ', 2 passes' : ''}`)
    for (const l of item.loras || []) if (l.name) add('LoRA', `${l.name.split('/').pop()} · ${l.strength}`)
    for (const [k, v] of detailLines(item.detail)) add(k, v)
    if (item.faceRef) add('Face reference', `${{ faceid: 'FaceID', portrait: 'FaceID Portrait', pulid: 'PuLID', both: 'FaceID + PuLID', instantid: 'InstantID', identity: 'Identity Edit (Krea 2)' }[item.faceRef.method] || 'FaceID'} · ${item.faceRef.character || `${item.faceRef.count} picture(s)`}${item.faceRef.pick ? ` (face ${item.faceRef.pick})` : ''}${item.faceRef.strength != null ? ` · ${item.faceRef.strength}` : ''}`)
    if (item.extraPicture) add('Added', `${item.extraPicture.kind === 'character' ? `character${item.extraPicture.character ? ` ${item.extraPicture.character}` : ''}` : 'object'} · strength ${item.extraPicture.strength}`)
    if (item.refPicture) add('Pose / style picture', `${{ pose: 'Body pose', depth: 'Depth', kdepth: 'Depth', style: 'Style / outfit', img2img: 'Img2img', scene: 'Scene (person put in)', edit: 'Edit picture' }[item.refPicture.mode] || item.refPicture.mode}${item.refPicture.denoise != null ? `, denoise ${item.refPicture.denoise}` : `, strength ${item.refPicture.strength}`}`)
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
          {onOpen && <button className="secondary" onClick={onOpen}>Open in {source.label}</button>}
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
