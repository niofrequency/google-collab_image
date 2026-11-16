import { useEffect, useState } from 'react'
import App from './App.jsx'
import Training from './Training.jsx'
import Video from './Video.jsx'
import Music from './Music.jsx'
import GalleryPrompts from './GalleryPrompts.jsx'
import CloudBar from './CloudBar.jsx'
import { ConfirmHost } from './ConfirmDialog.jsx'
import HeadSwap from './HeadSwap.jsx'
import FaceSwap from './FaceSwap.jsx'
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon, PromptsIcon, VideoIcon, HeadSwapIcon, FaceSwapIcon, MusicIcon, TrainingIcon } from './icons.jsx'

// short: the name under the icon in the narrow phone sidebar
const TABS = [
  { id: 'generate', label: 'Image Generator', short: 'Images', Icon: ImageIcon },
  { id: 'gallery', label: 'Gallery Prompts', short: 'Prompts', Icon: PromptsIcon },
  { id: 'video', label: 'Image to Video', short: 'Video', Icon: VideoIcon },
  { id: 'headswap', label: 'Head Swap', short: 'Head Swap', Icon: HeadSwapIcon },
  { id: 'faceswap', label: 'Face Swap', short: 'Face Swap', Icon: FaceSwapIcon },
  { id: 'music', label: 'Music', short: 'Music', Icon: MusicIcon },
  { id: 'train', label: 'LoRA Training', short: 'Training', Icon: TrainingIcon },
]

// Both tabs stay mounted (hidden with CSS) so switching doesn't lose anything you were doing
export default function Root() {
  const [tab, setTab] = useState(localStorage.getItem('tab') || 'generate')
  // Desktop only: the sidebar can shrink to icons. (Phones always get the narrow icon column.)
  const [collapsed, setCollapsed] = useState(localStorage.getItem('sidebar_collapsed') === '1')
  function toggleSidebar() {
    setCollapsed(c => { localStorage.setItem('sidebar_collapsed', c ? '0' : '1'); return !c })
  }
  function pick(id) {
    setTab(id)
    localStorage.setItem('tab', id)
    window.scrollTo(0, 0)  // each tab starts at its top
  }
  useEffect(() => {  // "Video start" / "Video end" in the Image Generator's viewer switch to the video tab
    const go = () => pick('video')
    window.addEventListener('send-to-video', go)
    return () => window.removeEventListener('send-to-video', go)
  }, [])
  return (
    <div className="layout">
      <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => pick(t.id)}
            title={t.label} aria-current={tab === t.id ? 'page' : undefined}>
            <t.Icon />
            <span className="nav-label">{t.label}</span>
            <span className="nav-short">{t.short}</span>
          </button>
        ))}
        <button className="nav-item sidebar-toggle" onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          <span className="nav-label">Collapse</span>
        </button>
      </nav>
      <main className="main">
      <CloudBar />
      <div style={{ display: tab === 'generate' ? 'block' : 'none' }}><App active={tab === 'generate'} /></div>
      <div style={{ display: tab === 'gallery' ? 'block' : 'none' }}><GalleryPrompts /></div>
      <div style={{ display: tab === 'video' ? 'block' : 'none' }}><Video active={tab === 'video'} /></div>
      <div style={{ display: tab === 'headswap' ? 'block' : 'none' }}><HeadSwap active={tab === 'headswap'} /></div>
      <div style={{ display: tab === 'faceswap' ? 'block' : 'none' }}><FaceSwap active={tab === 'faceswap'} /></div>
      <div style={{ display: tab === 'music' ? 'block' : 'none' }}><Music /></div>
      <div style={{ display: tab === 'train' ? 'block' : 'none' }}><Training active={tab === 'train'} /></div>
      </main>
      <ConfirmHost />
    </div>
  )
}
