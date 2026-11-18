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
export function NotebookIcon(props) {
  return <NavSvg {...props}><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M7.5 9.5l2.5 2.5-2.5 2.5" /><line x1="12" y1="15" x2="16.5" y2="15" /></NavSvg>
}
export function GalleryIcon(props) {
  return <NavSvg {...props}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></NavSvg>
}

// Full-size viewer actions (same line style as the sidebar icons)
export function InfoIcon(props) {
  return <NavSvg {...props}><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16.5" /><circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" /></NavSvg>
}
export function UsePromptIcon(props) {
  return <NavSvg {...props}><path d="M4 5h12M4 9h12M4 13h7" /><path d="M14 17h7" /><path d="M18 14l3 3-3 3" /></NavSvg>
}
export function UseFaceIcon(props) {
  return <NavSvg {...props}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><circle cx="12" cy="10.5" r="2.8" /><path d="M7.8 17c.9-1.9 2.4-2.8 4.2-2.8s3.3.9 4.2 2.8" /></NavSvg>
}
export function PoseIcon(props) {
  return <NavSvg {...props}><circle cx="12" cy="4.6" r="1.9" /><path d="M12 7v7M12 9.5l-5-2.5M12 9.5l5 3M12 14l-3.5 6.5M12 14l3.5 6.5" /></NavSvg>
}
export function VideoStartIcon(props) {
  return <NavSvg {...props}><rect x="6" y="5" width="15" height="14" rx="2.5" /><path d="M11.5 9.5l4 2.5-4 2.5z" /><line x1="3" y1="5" x2="3" y2="19" /></NavSvg>
}
export function VideoEndIcon(props) {
  return <NavSvg {...props}><rect x="3" y="5" width="15" height="14" rx="2.5" /><path d="M8.5 9.5l4 2.5-4 2.5z" /><line x1="21" y1="5" x2="21" y2="19" /></NavSvg>
}
export function InpaintIcon(props) {
  return <NavSvg {...props}><path d="M14.5 4.5l5 5L10 19H5v-5z" /><line x1="12.5" y1="6.5" x2="17.5" y2="11.5" /><path d="M3 21h7" strokeDasharray="2 2" /></NavSvg>
}
export function RefineFaceIcon(props) {
  return <NavSvg {...props}><circle cx="10" cy="11" r="6.5" /><circle cx="7.8" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="12.2" cy="10" r="0.8" fill="currentColor" stroke="none" /><path d="M8 13.4c.6.7 1.3 1 2 1s1.4-.3 2-1" /><path d="M18.5 2.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" /></NavSvg>
}
export function SaveCharacterIcon(props) {
  return <NavSvg {...props}><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c.8-3.6 3.4-5.5 6.5-5.5 1.6 0 3 .5 4.2 1.4" /><line x1="18.5" y1="13.5" x2="18.5" y2="20.5" /><line x1="15" y1="17" x2="22" y2="17" /></NavSvg>
}
export function FolderAddIcon(props) {
  return <NavSvg {...props}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" /><line x1="12" y1="11.5" x2="12" y2="16.5" /><line x1="9.5" y1="14" x2="14.5" y2="14" /></NavSvg>
}
export function DownloadIcon(props) {
  return <NavSvg {...props}><path d="M12 4v11" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 17.5v1A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-1" /></NavSvg>
}

// An icon button with a label that appears right away on hover (and is read out by screen readers)
export function IconButton({ label, children, className = '', ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} data-tip={label} {...rest}>{children}</button>
  )
}

// The ARX logo: a bold black "A" with a thin light outline and a small sparkle (also the browser tab's icon)
export function ArxLogo({ size = 40, title = 'ARX Image Generator' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title}>
      <title>{title}</title>
      <path fillRule="evenodd" fill="#0b0b0b" stroke="#e8e8e8" strokeWidth="1.3" strokeLinejoin="round"
        d="M16 3.5 L27.5 28 H22 L20.1 23.2 H11.9 L10 28 H4.5 Z M13.8 18.6 H18.2 L16 13.4 Z" />
      <path d="M26.2 3 l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#e8e8e8" />
    </svg>
  )
}

// Image Generator view switches
export function SimpleModeIcon(props) {
  return <NavSvg {...props}><rect x="4" y="4" width="16" height="16" rx="3" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="13" y2="14" /></NavSvg>
}
export function AdvancedModeIcon(props) {
  return <NavSvg {...props}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2" fill="var(--bg, #111)" /><circle cx="15" cy="12" r="2" fill="var(--bg, #111)" /><circle cx="7" cy="17" r="2" fill="var(--bg, #111)" /></NavSvg>
}
export function PageLayoutIcon(props) {
  return <NavSvg {...props}><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></NavSvg>
}
export function WorkspaceIcon(props) {
  return <NavSvg {...props}><rect x="3" y="4" width="8" height="7" rx="1.5" /><rect x="13" y="7" width="8" height="6" rx="1.5" /><rect x="5" y="14" width="9" height="6.5" rx="1.5" /></NavSvg>
}
export function ResetLayoutIcon(props) {
  return <NavSvg {...props}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4 4v4.5h4.5" /></NavSvg>
}
