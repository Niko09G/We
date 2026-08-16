'use client'

import { useEffect } from 'react'

type DynamicThemeColorProps = {
  color: string
}

export function DynamicThemeColor({ color }: DynamicThemeColorProps) {
  useEffect(() => {
    document.documentElement.style.backgroundColor = color
    document.body.style.backgroundColor = color

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', color)
  }, [color])

  return null
}
