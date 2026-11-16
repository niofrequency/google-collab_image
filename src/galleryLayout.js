// Gallery grid sizes shared by the image, video and head swap galleries.
// On a computer the Size slider sets the thumbnail width in pixels. On a phone that would mean one
// huge picture per row, so there the slider picks 2, 3 or 4 columns that fill the width instead.
export const NARROW_GALLERY = 560

export function galleryLayout(width, thumbSize) {
  if (width >= NARROW_GALLERY) {
    return {
      grid: { gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` },
      tile: thumbSize,
      cols: Math.max(1, Math.floor((width + 12) / (thumbSize + 12))),
      narrow: false,
    }
  }
  const cols = thumbSize <= 170 ? 4 : thumbSize <= 260 ? 3 : 2
  const gap = 6
  return {
    grid: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap },
    tile: Math.max(60, Math.floor((width - gap * (cols - 1)) / cols)),
    cols,
    narrow: true,
  }
}
