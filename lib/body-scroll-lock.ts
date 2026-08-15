/** Reference-counted body scroll lock that preserves window scroll position. */
let lockCount = 0
let savedScrollY = 0

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    document.body.style.paddingRight =
      scrollbarWidth > 0 ? `${scrollbarWidth}px` : ''
  }
  lockCount += 1
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount !== 0) return

  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.left = ''
  document.body.style.right = ''
  document.body.style.width = ''
  document.body.style.paddingRight = ''
  window.scrollTo(0, savedScrollY)
}
