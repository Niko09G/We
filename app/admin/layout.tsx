import type { ReactNode } from 'react'
import AdminSidebar from './_components/AdminSidebar'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-font flex h-[100dvh] flex-col overflow-hidden bg-[#fafafa]">
      <AdminSidebar />
      <div className="flex min-h-0 flex-1 flex-col md:pl-[14.5rem]">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
