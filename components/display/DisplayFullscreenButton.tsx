'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const FADE_DELAY_MS = 3_000

export function DisplayFullscreenButton() {
  const [visible, setVisible] = useState(true)
  const fadeTimerRef = useRef<number | null>(null)

  const scheduleFade = useCallback(() => {
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = window.setTimeout(() => {
      setVisible(false)
    }, FADE_DELAY_MS)
  }, [])

  const reveal = useCallback(() => {
    setVisible(true)
    scheduleFade()
  }, [scheduleFade])

  useEffect(() => {
    scheduleFade()
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current)
    }
  }, [scheduleFade])

  useEffect(() => {
    const onPointerMove = () => reveal()
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [reveal])

  const enterFullscreen = useCallback(() => {
    reveal()
    void document.documentElement.requestFullscreen?.()
  }, [reveal])

  return (
    <button
      type="button"
      onClick={enterFullscreen}
      onFocus={reveal}
      aria-label="Enter fullscreen"
      className={`fixed right-5 top-5 z-[100] rounded-xl border border-white/10 bg-black/45 px-4 py-2 text-sm font-medium text-zinc-200 backdrop-blur-md transition-opacity duration-700 hover:bg-black/60 hover:text-white ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      Fullscreen
    </button>
  )
}
