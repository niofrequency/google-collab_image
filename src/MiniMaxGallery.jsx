import { useEffect, useState } from 'react'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('MiniMaxGallery', 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('videos')) {
        db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

async function dbAll() {
  const db = await openDB()
  return new Promise(resolve => {
    const req = db.transaction('videos', 'readonly').objectStore('videos').getAll()
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.created - a.created))
  })
}

async function dbDelete(id) {
  const db = await openDB()
  return new Promise(resolve => {
    db.transaction('videos', 'readwrite').objectStore('videos').delete(id).onsuccess = resolve
  })
}

export default function MiniMaxGallery() {
  const [videos, setVideos] = useState([])
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('minimax-gallery-changed', on)
    return () => window.removeEventListener('minimax-gallery-changed', on)
  }, [])

  async function load() {
    try {
      const items = await dbAll()
      setVideos(items.map(v => ({ ...v, src: URL.createObjectURL(v.blob) })))
    } catch (e) {
      console.error(e)
    }
  }

  async function remove(v) {
    if (!confirm('Delete this video?')) return
    await dbDelete(v.id)
    setViewing(null)
    load()
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1rem' }}>MiniMax Gallery</h2>
      {videos.length === 0 && <p style={{ opacity: 0.6 }}>No videos yet. Generate some in the MiniMax H3 tab.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {videos.map(v => (
          <div key={v.id} style={{ background: 'var(--surface)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setViewing(v)}>
            <video src={v.src} muted loop playsInline style={{ width: '100%', height: 140, objectFit: 'cover' }} />
            <div style={{ padding: 10, fontSize: 13 }}>
              <div>{v.resolution} · {v.duration}s · {v.aspectRatio}</div>
              <div style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>{new Date(v.created).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setViewing(null)}>
          <div style={{ maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <video src={viewing.src} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh', background: '#000' }} />
            <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <a href={viewing.src} download={`minimax-${viewing.id}.mp4`} style={{ color: 'var(--accent)' }}>Download</a>
              <button onClick={() => remove(viewing)} style={{ background: 'none', border: 'none', color: '#f55', cursor: 'pointer' }}>Delete</button>
              <button onClick={() => setViewing(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
