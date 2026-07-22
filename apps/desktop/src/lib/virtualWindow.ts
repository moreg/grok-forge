/** Fixed-row virtual window for long lists (diff lines, etc.). */

export type VirtualWindow = {
  start: number
  end: number
  offsetTop: number
  totalHeight: number
}

export function computeVirtualWindow(options: {
  itemCount: number
  itemHeight: number
  scrollTop: number
  viewportHeight: number
  overscan?: number
}): VirtualWindow {
  const {
    itemCount,
    itemHeight,
    scrollTop,
    viewportHeight,
    overscan = 10,
  } = options

  if (itemCount <= 0 || itemHeight <= 0) {
    return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 }
  }

  const totalHeight = itemCount * itemHeight
  const safeScroll = Math.max(0, scrollTop)
  const start = Math.max(0, Math.floor(safeScroll / itemHeight) - overscan)
  const visibleCount = Math.ceil(Math.max(viewportHeight, 1) / itemHeight) + overscan * 2
  const end = Math.min(itemCount, start + visibleCount)

  return {
    start,
    end,
    offsetTop: start * itemHeight,
    totalHeight,
  }
}

/** Skip virtualization for short lists — DOM is cheaper than scroll bookkeeping. */
export function shouldVirtualize(itemCount: number, threshold = 80): boolean {
  return itemCount >= threshold
}
