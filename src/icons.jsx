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
