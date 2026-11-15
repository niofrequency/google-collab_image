import { useState } from 'react'
import App from './App.jsx'
import Training from './Training.jsx'
import Video from './Video.jsx'
import Music from './Music.jsx'
import GalleryPrompts from './GalleryPrompts.jsx'

const TABS = [
  { id: 'generate', label: 'Image Generator' },
  { id: 'gallery', label: 'Gallery Prompts' },
  { id: 'video', label: 'Image to Video' },
  { id: 'music', label: 'Music' },
  { id: 'train', label: 'LoRA Training' },
]

// Both tabs stay mounted (hidden with CSS) so switching doesn't lose anything you were doing
export default function Root() {
  const [tab, setTab] = useState(localStorage.getItem('tab') || 'generate')
  function pick(id) { setTab(id); localStorage.setItem('tab', id) }
  return (
    <>
      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => pick(t.id)}>{t.label}</button>
        ))}
      </nav>
      <div style={{ display: tab === 'generate' ? 'block' : 'none' }}><App active={tab === 'generate'} /></div>
      <div style={{ display: tab === 'gallery' ? 'block' : 'none' }}><GalleryPrompts /></div>
      <div style={{ display: tab === 'video' ? 'block' : 'none' }}><Video active={tab === 'video'} /></div>
      <div style={{ display: tab === 'music' ? 'block' : 'none' }}><Music /></div>
      <div style={{ display: tab === 'train' ? 'block' : 'none' }}><Training active={tab === 'train'} /></div>
    </>
  )
}
