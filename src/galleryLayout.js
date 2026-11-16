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

// "Full images": justified rows (like Google Photos). Every picture in a row has the same height and keeps its
// own shape, so a wide picture takes more width than a tall one, and each full row fills the gallery width.
// ratio(item) = width / height. Returns rows of { height, full, cells: [{ item, index, ratio }] }.
export function justifyRows(items, ratio, width, targetHeight, gap) {
  const rows = []
  let cells = [], sum = 0
  const heightOf = (s, n) => (width - gap * (n - 1)) / s
  items.forEach((item, index) => {
    const r = Math.min(4, Math.max(0.25, ratio(item) || 1))
    cells.push({ item, index, ratio: r })
    sum += r
    if (sum * targetHeight + gap * (cells.length - 1) < width) return
    // The row is full. End it with or without this picture, whichever height is closer to the target
    const withIt = heightOf(sum, cells.length)
    const without = cells.length > 1 ? heightOf(sum - r, cells.length - 1) : Infinity
    if (Math.abs(without - targetHeight) < Math.abs(withIt - targetHeight)) {
      const last = cells.pop()
      rows.push({ height: without, full: true, cells })
      cells = [last]; sum = r
    } else {
      rows.push({ height: Math.max(40, withIt), full: true, cells })
      cells = []; sum = 0
    }
  })
  if (cells.length) rows.push({ height: targetHeight, full: false, cells })
  return rows
}

// Size for one picture in a justified row: full rows stretch to the width, the last row keeps the target height
export function cellStyle(row, cell) {
  return row.full
    ? { flex: `${cell.ratio} ${cell.ratio} 0px`, minWidth: 0 }
    : { flex: '0 0 auto', width: Math.round(cell.ratio * row.height) }
}

// Row height for the Size slider. A tall (2:3) picture keeps the width it had in the old column view
// (the column width), so tall pictures look the same and wide ones get the room they need.
export function justifiedHeight(layout, thumbSize) {
  return Math.round((layout.narrow ? layout.tile : thumbSize) * 1.46)
}
