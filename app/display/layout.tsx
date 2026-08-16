import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Live Display',
}

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return children
}
