import Link from 'next/link'
import { SeatingMapPanel } from '@/components/guest/SeatingMapPanel'

export default function SeatFinderPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-6 pb-10">
      <div className="mx-auto w-full max-w-lg">
        <SeatingMapPanel layout="page" showSectionHeading />

        <div className="mt-8">
          <Link
            href="/play"
            className="inline-flex text-sm font-semibold text-violet-700 underline-offset-4 transition hover:underline"
          >
            ← Back to lobby
          </Link>
        </div>
      </div>
    </main>
  )
}
