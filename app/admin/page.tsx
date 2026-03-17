'use client'

import { useEffect, useMemo, useState } from 'react'
import { deleteGreeting, listGreetings, type GreetingRow } from '@/lib/greetings-admin'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function AdminPage() {
  const [rows, setRows] = useState<GreetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasGreetings = rows.length > 0
  const headerSubtitle = useMemo(() => {
    if (loading) return 'Loading…'
    if (!hasGreetings) return 'No greetings yet.'
    return `${rows.length} greeting${rows.length === 1 ? '' : 's'}`
  }, [hasGreetings, loading, rows.length])

  async function onDelete(row: GreetingRow) {
    setNotice(null)
    setError(null)
    const ok = window.confirm('Delete this greeting? This cannot be undone.')
    if (!ok) return

    setDeletingId(row.id)
    try {
      const result = await deleteGreeting({ id: row.id, image_url: row.image_url })
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      if (result.storageWarning) setNotice(result.storageWarning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete greeting.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Admin · Greetings
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{headerSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {notice && (
          <div
            className="mb-6 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 text-amber-900 dark:text-amber-200"
            role="status"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-4 text-red-900 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-zinc-700 dark:text-zinc-300">
            Loading greetings…
          </div>
        )}

        {!loading && !hasGreetings && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
            <p className="text-zinc-900 dark:text-zinc-100 font-medium">No greetings yet</p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Once guests submit greetings, they’ll show up here.
            </p>
          </div>
        )}

        {!loading && hasGreetings && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => {
              const displayName = row.name?.trim() ? row.name.trim() : 'Anonymous'
              const isDeleting = deletingId === row.id

              return (
                <div
                  key={row.id}
                  className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                >
                  <div className="aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
                    <img
                      src={row.image_url}
                      alt={`Greeting photo from ${displayName}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {displayName}
                        </p>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatDate(row.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                        {row.status}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                      {row.message}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <a
                        href={row.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-zinc-600 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        Open image
                      </a>

                      <button
                        type="button"
                        onClick={() => void onDelete(row)}
                        disabled={isDeleting}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isDeleting ? 'Deleting…' : 'Delete'}
                      </button>
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

