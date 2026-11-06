import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { FOOTER_NOTE } from '@/lib/brand'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/dialog'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const COLLAPSE_KEY = 'aic-sidebar-collapsed'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()
  const currentUserId = useAppStore((s) => s.currentUserId)
  const environments = useAppStore((s) => s.environments)
  const kickProvisioning = useAppStore((s) => s.kickProvisioning)

  useEffect(() => {
    kickProvisioning()
  }, [currentUserId, environments, kickProvisioning])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-border transition-[width] duration-200 lg:block',
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-content flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
        {FOOTER_NOTE && (
          <footer className="border-t border-border px-4 py-4 text-center text-caption text-text-muted md:px-8">{FOOTER_NOTE}</footer>
        )}
      </div>
    </div>
  )
}
