import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { RequireRole, homeFor } from '@/components/layout/RequireRole'
import { useCurrentUser } from '@/store/useAppStore'
import Login from '@/pages/auth/Login'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import SuperAdminDashboard from '@/pages/super-admin/Dashboard'
import Tenants from '@/pages/super-admin/Tenants'
import TenantDetail from '@/pages/super-admin/TenantDetail'
import Registry from '@/pages/super-admin/Catalog'
import Providers from '@/pages/super-admin/Providers'
import Capacity from '@/pages/super-admin/Capacity'
import TenantAdminDashboard from '@/pages/tenant-admin/Dashboard'
import { ProjectDetail, Projects } from '@/pages/tenant-admin/Projects'
import CatalogToggles from '@/pages/tenant-admin/CatalogToggles'
import Quotas from '@/pages/tenant-admin/Quotas'
import Settings from '@/pages/tenant-admin/Settings'
import UsersPage from '@/pages/shared/UsersPage'
import RequestsQueue from '@/pages/shared/RequestsQueue'
import RequestDetail from '@/pages/shared/RequestDetail'
import Infrastructure from '@/pages/shared/Infrastructure'
import EnvironmentDetail from '@/pages/shared/EnvironmentDetail'
import Monitoring from '@/pages/shared/Monitoring'
import AuditLog from '@/pages/shared/AuditLog'
import Suggestions from '@/pages/shared/Suggestions'
import UserDashboard from '@/pages/user/Dashboard'
import NewEnvironment from '@/pages/user/NewEnvironment'
import UserCatalog from '@/pages/user/Catalog'
import CatalogDetail from '@/pages/user/CatalogDetail'
import Testing from '@/pages/user/testing/Testing'
import MyRequests from '@/pages/user/MyRequests'
import NotFound from '@/pages/NotFound'
import { AppEffects } from '@/components/layout/AppEffects'

function RootRedirect() {
  const user = useCurrentUser()
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

export default function App() {
  return (
    <TooltipProvider>
      <AppEffects />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route element={<RequireRole role="super_admin" />}>
          <Route element={<AppShell />}>
            <Route path="/super-admin" element={<SuperAdminDashboard />} />
            <Route path="/super-admin/tenants" element={<Tenants />} />
            <Route path="/super-admin/tenants/:id" element={<TenantDetail />} />
            <Route path="/super-admin/users" element={<UsersPage />} />
            <Route path="/super-admin/requests" element={<RequestsQueue />} />
            <Route path="/super-admin/requests/:id" element={<RequestDetail />} />
            <Route path="/super-admin/infrastructure" element={<Infrastructure />} />
            <Route path="/super-admin/infrastructure/:id" element={<EnvironmentDetail />} />
            <Route path="/super-admin/infrastructure/:id/edit" element={<NewEnvironment />} />
            <Route path="/super-admin/registry" element={<Registry />} />
            <Route path="/super-admin/suggestions" element={<Suggestions />} />
            <Route path="/super-admin/providers" element={<Providers />} />
            <Route path="/super-admin/capacity" element={<Capacity />} />
            <Route path="/super-admin/monitoring" element={<Monitoring />} />
            <Route path="/super-admin/audit" element={<AuditLog />} />
            <Route path="/super-admin/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="tenant_admin" />}>
          <Route element={<AppShell />}>
            <Route path="/tenant-admin" element={<TenantAdminDashboard />} />
            <Route path="/tenant-admin/users" element={<UsersPage />} />
            <Route path="/tenant-admin/projects" element={<Projects />} />
            <Route path="/tenant-admin/projects/:id" element={<ProjectDetail />} />
            <Route path="/tenant-admin/infrastructure" element={<Infrastructure />} />
            <Route path="/tenant-admin/infrastructure/new" element={<NewEnvironment />} />
            <Route path="/tenant-admin/infrastructure/:id" element={<EnvironmentDetail />} />
            <Route path="/tenant-admin/infrastructure/:id/edit" element={<NewEnvironment />} />
            <Route path="/tenant-admin/requests" element={<RequestsQueue />} />
            <Route path="/tenant-admin/requests/:id" element={<RequestDetail />} />
            <Route path="/tenant-admin/models" element={<CatalogToggles mode="models" />} />
            <Route path="/tenant-admin/capabilities" element={<CatalogToggles mode="capabilities" />} />
            <Route path="/tenant-admin/suggestions" element={<Suggestions />} />
            <Route path="/tenant-admin/monitoring" element={<Monitoring />} />
            <Route path="/tenant-admin/quotas" element={<Quotas />} />
            <Route path="/tenant-admin/audit" element={<AuditLog />} />
            <Route path="/tenant-admin/settings" element={<Settings />} />
            <Route path="/tenant-admin/*" element={<NotFound />} />
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
            <Route path="/app/monitoring" element={<Monitoring />} />
            <Route path="/app/requests" element={<MyRequests />} />
            <Route path="/app/requests/:id" element={<RequestDetail />} />
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
