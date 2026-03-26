import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import AdminSidebar from './_components/AdminSidebar'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${inter.className} min-h-screen bg-[#fafafa]`}>
      <AdminSidebar />
      <div className="md:pl-[14.5rem]">
        <main>{children}</main>
      </div>
    </div>
  )
}
