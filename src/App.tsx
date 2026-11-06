import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { RequireRole, homeFor } from '@/components/layout/RequireRole'
import { useCurrentUser } from '@/store/useAppStore'
import Login from '@/pages/auth/Login'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminRequests from '@/pages/admin/Requests'
import AdminTenants from '@/pages/admin/Tenants'
import AdminTenantDetail from '@/pages/admin/TenantDetail'
import AdminUsers from '@/pages/admin/Users'
import AdminEnvironments from '@/pages/admin/Environments'
import AdminCatalog from '@/pages/admin/Catalog'
import AdminProviders from '@/pages/admin/Providers'
import UserDashboard from '@/pages/user/Dashboard'
import NewEnvironment from '@/pages/user/NewEnvironment'
import EnvironmentDetail from '@/pages/user/EnvironmentDetail'
import UserCatalog from '@/pages/user/Catalog'
import CatalogDetail from '@/pages/user/CatalogDetail'
import Testing from '@/pages/user/testing/Testing'
import MyRequests from '@/pages/user/MyRequests'
import NotFound from '@/pages/NotFound'

function RootRedirect() {
  const user = useCurrentUser()
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

export default function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route element={<RequireRole role="admin" />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/requests" element={<AdminRequests />} />
            <Route path="/admin/tenants" element={<AdminTenants />} />
            <Route path="/admin/tenants/:id" element={<AdminTenantDetail />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/environments" element={<AdminEnvironments />} />
            <Route path="/admin/catalog" element={<AdminCatalog />} />
            <Route path="/admin/providers" element={<AdminProviders />} />
            <Route path="/admin/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="user" />}>
          <Route element={<AppShell />}>
            <Route path="/app" element={<UserDashboard />} />
            <Route path="/app/environments/new" element={<NewEnvironment />} />
            <Route path="/app/environments/:id/edit" element={<NewEnvironment />} />
            <Route path="/app/environments/:id" element={<EnvironmentDetail />} />
            <Route path="/app/catalog" element={<UserCatalog />} />
            <Route path="/app/catalog/:id" element={<CatalogDetail />} />
            <Route path="/app/testing" element={<Testing />} />
            <Route path="/app/requests" element={<MyRequests />} />
            <Route path="/app/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>

      <Toaster
        position="bottom-right"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-card border border-l-4 border-border bg-bg-surface p-4 text-sm text-text-primary shadow-pop',
            title: 'font-semibold',
            description: 'text-caption text-text-secondary',
            success: 'border-l-teal',
            error: 'border-l-red',
            warning: 'border-l-tangerine',
            info: 'border-l-blue',
            default: 'border-l-indigo',
            icon: 'mt-0.5',
          },
        }}
      />
    </TooltipProvider>
  )
}
