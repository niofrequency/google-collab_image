// Small line icons (SVG, so they look the same on every device instead of depending on emoji fonts)
export function ZoomIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
      <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
      <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
    </svg>
  )
}

export function PlayIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function CloseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

export function ChevronLeftIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true"><polyline points="15 5 8 12 15 19" /></svg>
}

export function ChevronRightIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true"><polyline points="9 5 16 12 9 19" /></svg>
}

// Sidebar tab icons
function NavSvg({ size = 22, children }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true">{children}</svg>
}
export function ImageIcon(props) {
  return <NavSvg {...props}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-9 9" /></NavSvg>
}
export function PromptsIcon(props) {
  return <NavSvg {...props}><path d="M5 4h11l3 3v13H5z" /><line x1="8.5" y1="10" x2="15.5" y2="10" /><line x1="8.5" y1="13.5" x2="15.5" y2="13.5" /><line x1="8.5" y1="17" x2="12.5" y2="17" /></NavSvg>
}
export function VideoIcon(props) {
  return <NavSvg {...props}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3z" /></NavSvg>
}
export function HeadSwapIcon(props) {
  return <NavSvg {...props}><circle cx="12" cy="8" r="4" /><path d="M4.5 21c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6" /><path d="M18.5 3.5l2 2-2 2" /><path d="M5.5 7.5l-2-2 2-2" /></NavSvg>
}
export function MusicIcon(props) {
  return <NavSvg {...props}><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></NavSvg>
}
export function TrainingIcon(props) {
  return <NavSvg {...props}><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /></NavSvg>
}
export function FaceSwapIcon(props) {
  return <NavSvg {...props}><circle cx="12" cy="12" r="8.5" /><circle cx="9" cy="10.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="15" cy="10.5" r="0.9" fill="currentColor" stroke="none" /><path d="M8.8 14.6c.9 1.1 2 1.6 3.2 1.6s2.3-.5 3.2-1.6" /></NavSvg>
}
export function CharactersIcon(props) {
  return <NavSvg {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.6c2.4.2 4.3 1.8 5 5.4" /></NavSvg>
}
export function UpscaleIcon(props) {
  return <NavSvg {...props}><rect x="3" y="11" width="10" height="10" rx="1.5" /><path d="M13 3h8v8" /><path d="M21 3l-9 9" /></NavSvg>
}
export function EyeIcon(props) {
  return <NavSvg {...props}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></NavSvg>
}
export function EyeOffIcon(props) {
  return <NavSvg {...props}><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><line x1="3" y1="3" x2="21" y2="21" /></NavSvg>
}
