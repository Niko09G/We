'use client'

import { useEffect, useMemo, useState } from 'react'
import { listGreetings, type GreetingRow } from '@/lib/greetings-admin'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export default function AdminPage() {
  const [rows, setRows] = useState<GreetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await listGreetings()
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load greetings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const hasGreetings = rows.length > 0
  const headerSubtitle = useMemo(() => {
    if (loading) return 'Loading…'
    if (!hasGreetings) return 'No greetings yet.'
    return `${rows.length} greeting${rows.length === 1 ? '' : 's'}`
  }, [hasGreetings, loading, rows.length])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Admin · Greetings
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{headerSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div
            className="mb-4 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2"
              >
                <div className="h-16 w-16 shrink-0 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="h-3.5 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-3.5 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                  <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-3 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !hasGreetings && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-6 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No greetings yet</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Once guests submit greetings, they’ll show up here.
            </p>
          </div>
        )}

        {!loading && hasGreetings && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {rows.map((row) => {
              const displayName = row.name?.trim() ? row.name.trim() : 'Anonymous'

              return (
                <div
                  key={row.id}
                  className="flex gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    <img
                      src={row.image_url}
                      alt={`${displayName}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {displayName}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(row.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                      {row.message}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="rounded border border-zinc-200 dark:border-zinc-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {row.status}
                      </span>
                      <a
                        href={row.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        Open image
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
