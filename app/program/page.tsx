import Link from 'next/link'

export default function EventProgramPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Event Program
          </h1>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            The program will be posted here soon. In the meantime, you can
            send greetings and submit mission attempts.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              Send a greeting
            </Link>
            <Link
              href="/play"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              Back to hub
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

