'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const PIN_LENGTH = 6

function resolveRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/admin'
  if (raw.startsWith('/snaps')) return '/snaps'
  if (raw.startsWith('/admin')) return '/admin'
  return '/admin'
}

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectPath = useMemo(
    () => resolveRedirectPath(searchParams.get('redirect')),
    [searchParams]
  )

  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const inFlightRef = useRef(false)

  const appendDigit = useCallback((digit: string) => {
    setError(null)
    setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + digit))
  }, [])

  const backspace = useCallback(() => {
    setError(null)
    setPin((prev) => prev.slice(0, -1))
  }, [])

  const clearPin = useCallback(() => {
    setError(null)
    setPin('')
  }, [])

  const handleVerifyPin = useCallback(
    async (value: string) => {
      if (value.length !== PIN_LENGTH || inFlightRef.current) return
      inFlightRef.current = true
      setIsSubmitting(true)
      setError(null)
      let succeeded = false
      try {
        const res = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: value }),
        })

        if (res.status === 401 || !res.ok) {
          setError('Incorrect PIN')
          setShake(true)
          setPin('')
          window.setTimeout(() => setShake(false), 450)
          return
        }

        succeeded = true
        router.push(redirectPath || '/admin')
        router.refresh()
      } catch {
        setError('Incorrect PIN')
        setShake(true)
        setPin('')
        window.setTimeout(() => setShake(false), 450)
      } finally {
        setIsSubmitting(false)
        if (!succeeded) inFlightRef.current = false
      }
    },
    [redirectPath, router]
  )

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      void handleVerifyPin(pin)
    }
  }, [pin, handleVerifyPin])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        appendDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        backspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        clearPin()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [appendDigit, backspace, clearPin, isSubmitting])

  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0b0f] text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Staff access
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Enter PIN
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Required for admin and snaps host tools.
          </p>
        </div>

        <div
          className={`mx-auto mb-8 flex gap-3 ${shake ? 'animate-[shake_0.45s_ease-in-out]' : ''}`}
          aria-label="PIN entry"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                i < pin.length
                  ? 'border-amber-400 bg-amber-400'
                  : 'border-zinc-600 bg-transparent'
              }`}
            />
          ))}
        </div>

        {error ? (
          <p className="mb-6 text-center text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : (
          <p className="mb-6 text-center text-sm text-zinc-500">
            {isSubmitting ? 'Verifying…' : `${pin.length}/${PIN_LENGTH} digits`}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {keypad.map((key) => {
            if (key === 'clear') {
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSubmitting || pin.length === 0}
                  onClick={clearPin}
                  className="h-16 rounded-2xl border border-zinc-800 bg-zinc-900/80 text-sm font-medium text-zinc-300 transition active:scale-[0.98] disabled:opacity-40"
                >
                  Clear
                </button>
              )
            }
            if (key === 'back') {
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSubmitting || pin.length === 0}
                  onClick={backspace}
                  className="flex h-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 transition active:scale-[0.98] disabled:opacity-40"
                  aria-label="Backspace"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M9 6H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4-4V10l4-4Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path d="M13 10l4 4M17 10l-4 4" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
              )
            }
            return (
              <button
                key={key}
                type="button"
                disabled={isSubmitting || pin.length >= PIN_LENGTH}
                onClick={() => appendDigit(key)}
                className="h-16 rounded-2xl border border-zinc-800 bg-zinc-900 text-2xl font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition active:scale-[0.98] disabled:opacity-40"
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20%,
          60% {
            transform: translateX(-6px);
          }
          40%,
          80% {
            transform: translateX(6px);
          }
        }
      `}</style>
    </div>
  )
}
