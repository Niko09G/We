import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import AdminSidebar from './_components/AdminSidebar'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${inter.className} min-h-screen bg-zinc-50 dark:bg-zinc-950`}>
      <AdminSidebar />
      <div className="md:pl-64">
        <main>{children}</main>
      </div>
    </div>
  )
}
