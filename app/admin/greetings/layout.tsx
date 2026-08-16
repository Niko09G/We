import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Greetings',
}

export default function AdminGreetingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
