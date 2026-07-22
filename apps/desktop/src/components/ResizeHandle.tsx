import { useEffect, useRef } from 'react'

export function ResizeHandle({
  ariaLabel,
  onDrag,
  onDragEnd,
}: {
  ariaLabel: string
  onDrag: (deltaX: number) => void
  /** Persist layout after a drag (or keyboard nudge) finishes. */
  onDragEnd?: () => void
}) {
  const dragging = useRef(false)
  const lastX = useRef(0)
  const onDragRef = useRef(onDrag)
  const onDragEndRef = useRef(onDragEnd)
  onDragRef.current = onDrag
  onDragEndRef.current = onDragEnd

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      const delta = event.clientX - lastX.current
      lastX.current = event.clientX
      if (delta !== 0) onDragRef.current(delta)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.classList.remove('resizing-panels')
      onDragEndRef.current?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault()
        dragging.current = true
        lastX.current = event.clientX
        document.body.classList.add('resizing-panels')
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onDrag(-12)
          onDragEnd?.()
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          onDrag(12)
          onDragEnd?.()
        }
      }}
    />
  )
}
