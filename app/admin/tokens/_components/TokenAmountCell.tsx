'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

type Props = {
  tokenId: string
  points: number
  disabled?: boolean
  onUpdated: (points: number) => void
  onError: (message: string) => void
}

export default function TokenAmountCell({
  tokenId,
  points,
  disabled,
  onUpdated,
  onError,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(points))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setValue(String(points))
  }, [points, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEditing() {
    if (disabled || saving) return
    setValue(String(points))
    setEditing(true)
  }

  function cancel() {
    setValue(String(points))
    setEditing(false)
  }

  async function save() {
    const next = Math.floor(Number(value))
    if (!Number.isFinite(next) || next < 0) {
      onError('Amount must be a non-negative integer.')
      return
    }
    if (next === points) {
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: next }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; token?: { points: number } }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Could not update amount.')
      }

      onUpdated(data.token?.points ?? next)
      setEditing(false)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update amount.')
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-[14px] tabular-nums text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={cancel}
          className="rounded-md border border-neutral-200/60 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-neutral-50/80 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={startEditing}
      className="group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[14px] font-medium tabular-nums text-zinc-900 transition-colors hover:bg-neutral-50/80 disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-zinc-800/60"
      title="Edit amount"
    >
      <span>{points}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  )
}
