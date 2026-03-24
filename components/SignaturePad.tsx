'use client'

import { useCallback, useRef, useState } from 'react'

type SignaturePadRef = {
  getBlob: () => Promise<Blob | null>
  clear: () => void
  isEmpty: () => boolean
}

type Props = {
  /** Called when the user finishes a stroke (so parent can enable submit). */
  onStrokeEnd?: () => void
  /** First contact with the pad (hide placeholders, etc.). */
  onStrokeStart?: () => void
  /** After the user clears the pad. */
  onClear?: () => void
  /** Ref to get blob, clear, and isEmpty. */
  padRef?: React.RefObject<SignaturePadRef | null>
  disabled?: boolean
  className?: string
  /** Height of the canvas in pixels. */
  height?: number
  /** Classes for the canvas wrapper (border, background). */
  canvasSurfaceClassName?: string
  /** Show the default “Clear” control under the pad. */
  showClearButton?: boolean
  /** Ink color (use dark on light backgrounds). */
  strokeColor?: string
}

export function SignaturePad({
  onStrokeEnd,
  onStrokeStart,
  onClear,
  padRef,
  disabled = false,
  className = '',
  height = 200,
  canvasSurfaceClassName = 'rounded border border-zinc-700 bg-zinc-800/50',
  showClearButton = true,
  strokeColor = '#ffffff',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasDrawn, setHasDrawn] = useState(false)

  const getContext = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }, [])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }, [getContext])

  const getBlob = useCallback((): Promise<Blob | null> => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return Promise.resolve(null)
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/png',
        0.92
      )
    })
  }, [hasDrawn])

  const isEmpty = useCallback(() => !hasDrawn, [])

  // Expose ref methods
  if (padRef) {
    (padRef as React.MutableRefObject<SignaturePadRef | null>).current = {
      getBlob,
      clear,
      isEmpty,
    }
  }

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return
      const canvas = canvasRef.current
      const ctx = getContext()
      if (!canvas || !ctx) return
      onStrokeStart?.()

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (clientX - rect.left) * scaleX
      const y = (clientY - rect.top) * scaleY

      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    },
    [disabled, getContext, onStrokeStart, strokeColor]
  )

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return
      const canvas = canvasRef.current
      const ctx = getContext()
      if (!canvas || !ctx) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (clientX - rect.left) * scaleX
      const y = (clientY - rect.top) * scaleY

      ctx.lineTo(x, y)
      ctx.stroke()
      setHasDrawn(true)
    },
    [disabled, getContext]
  )

  const handleEnd = useCallback(() => {
    if (hasDrawn) onStrokeEnd?.()
  }, [hasDrawn, onStrokeEnd])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      handleStart(e.clientX, e.clientY)
    },
    [handleStart]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      if (e.buttons !== 1 && e.pointerType !== 'touch') return
      handleMove(e.clientX, e.clientY)
    },
    [handleMove]
  )

  const onPointerUp = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  const onPointerLeave = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  // Set canvas size from container (responsive)
  const setCanvasSize = useCallback((el: HTMLCanvasElement | null) => {
    if (!el) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const rect = el.getBoundingClientRect()
    const w = Math.round(rect.width * dpr)
    const h = Math.round((height || 200) * dpr)
    if (el.width !== w || el.height !== h) {
      el.width = w
      el.height = h
    }
  }, [height])

  return (
    <div className={className}>
      <div
        className={`relative touch-none min-w-[200px] overflow-hidden ${canvasSurfaceClassName}`}
        style={{ height }}
      >
        <canvas
          ref={(el) => {
            (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el
            setCanvasSize(el)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerCancel={onPointerUp}
          className="block w-full cursor-crosshair"
          style={{ width: '100%', height, touchAction: 'none' }}
          width={0}
          height={0}
        />
      </div>
      {showClearButton ? (
        <button
          type="button"
          onClick={() => {
            clear()
            onClear?.()
          }}
          disabled={disabled}
          className="mt-2 text-base font-medium text-zinc-600 underline hover:no-underline disabled:opacity-50 dark:text-white/70"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
