'use client'

import Link from 'next/link'

export default function DisplayControlsPlaceholderPage() {
  return (
    <main className="px-4 py-6">
      <div className="mx-auto w-full max-w-3xl rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Display controls coming soon
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          For now, use the display page for the leaderboard and recent activity.
        </p>
        <div className="mt-4">
          <Link
            href="/admin"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-200 underline"
          >
            Back to admin overview
          </Link>
        </div>
      </div>
    </main>
  )
}

