import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RequireRole, homeFor } from '@/components/layout/RequireRole'
import { useCurrentUser } from '@/store/useAppStore'
import Login from '@/pages/auth/Login'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import SuperAdminDashboard from '@/pages/super-admin/Dashboard'
import Tenants from '@/pages/super-admin/Tenants'
import TenantDetail from '@/pages/super-admin/TenantDetail'
import Registry from '@/pages/super-admin/Catalog'
import Providers from '@/pages/super-admin/Providers'
import InfraProviders from '@/pages/super-admin/InfraProviders'
import InfraProviderDetail from '@/pages/super-admin/InfraProviderDetail'
import Capacity from '@/pages/super-admin/Capacity'
import TenantAdminDashboard from '@/pages/tenant-admin/Dashboard'
import Projects from '@/pages/shared/Projects'
import ProjectDetail from '@/pages/shared/ProjectDetail'
import NewProject from '@/pages/shared/NewProject'
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
import UserDashboard from '@/pages/user/Dashboard'
import NewEnvironment from '@/pages/user/NewEnvironment'
import UserCatalog from '@/pages/user/Catalog'
import CatalogDetail from '@/pages/user/CatalogDetail'
import Testing from '@/pages/user/testing/Testing'
import MyRequests from '@/pages/user/MyRequests'
import SuggestionDetail from '@/pages/user/SuggestionDetail'
import QaDashboard from '@/pages/qa/Dashboard'
import ModelTesting from '@/pages/qa/ModelTesting'
import ModelComparison from '@/pages/qa/ModelComparison'
import TestConfigurations from '@/pages/qa/TestConfigurations'
import EnvironmentTesting from '@/pages/qa/EnvironmentTesting'
import TestReports from '@/pages/qa/TestReports'
import ReportDetail, { SharedReportRedirect } from '@/pages/qa/ReportDetail'
import ProviderRequestDetail from '@/pages/shared/ProviderRequestDetail'
import TenantInfraProviders from '@/pages/tenant-admin/InfraProviders'
import NotFound from '@/pages/NotFound'
import TerminalPage from '@/pages/shared/TerminalPage'
import { AppEffects } from '@/components/layout/AppEffects'

function RootRedirect() {
  const user = useCurrentUser()
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

/** The old Capability suggestions pages now live inside the Requests queue. */
function SuggestionsRedirect({ base }: { base: string }) {
  const [params] = useSearchParams()
  const id = params.get('id')
  return <Navigate to={`${base}/requests?type=capability${id ? `&id=${encodeURIComponent(id)}` : ''}`} replace />
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
            <Route path="/super-admin/projects" element={<Projects />} />
            <Route path="/super-admin/projects/:id" element={<ProjectDetail />} />
            <Route path="/super-admin/infrastructure" element={<Infrastructure />} />
            <Route path="/super-admin/infrastructure/:id" element={<EnvironmentDetail />} />
            <Route path="/super-admin/infrastructure/:id/edit" element={<NewEnvironment />} />
            <Route path="/super-admin/registry" element={<Registry />} />
            <Route path="/super-admin/suggestions" element={<SuggestionsRedirect base="/super-admin" />} />
            <Route path="/super-admin/providers" element={<Providers />} />
            <Route path="/super-admin/infra-providers" element={<InfraProviders />} />
            <Route path="/super-admin/infra-providers/:id" element={<InfraProviderDetail />} />
            <Route path="/super-admin/capacity" element={<Capacity />} />
            <Route path="/super-admin/monitoring" element={<Monitoring />} />
            <Route path="/super-admin/audit" element={<AuditLog />} />
            <Route path="/super-admin/reports/:id" element={<ReportDetail />} />
            <Route path="/super-admin/provider-requests/:id" element={<ProviderRequestDetail />} />
            <Route path="/super-admin/provider-requests" element={<Navigate to="/super-admin/requests?type=provider" replace />} />
            <Route path="/super-admin/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="tenant_admin" />}>
          <Route element={<AppShell />}>
            <Route path="/tenant-admin" element={<TenantAdminDashboard />} />
            <Route path="/tenant-admin/users" element={<UsersPage />} />
            <Route path="/tenant-admin/projects" element={<Projects />} />
            <Route path="/tenant-admin/projects/new" element={<NewProject />} />
            <Route path="/tenant-admin/projects/:id" element={<ProjectDetail />} />
            <Route path="/tenant-admin/infrastructure" element={<Infrastructure />} />
            <Route path="/tenant-admin/infrastructure/new" element={<NewEnvironment />} />
            <Route path="/tenant-admin/infrastructure/:id" element={<EnvironmentDetail />} />
            <Route path="/tenant-admin/infrastructure/:id/edit" element={<NewEnvironment />} />
            <Route path="/tenant-admin/requests" element={<RequestsQueue />} />
            <Route path="/tenant-admin/requests/:id" element={<RequestDetail />} />
            <Route path="/tenant-admin/models" element={<CatalogToggles mode="models" />} />
            <Route path="/tenant-admin/capabilities" element={<CatalogToggles mode="capabilities" />} />
            <Route path="/tenant-admin/suggestions" element={<SuggestionsRedirect base="/tenant-admin" />} />
            <Route path="/tenant-admin/monitoring" element={<Monitoring />} />
            <Route path="/tenant-admin/quotas" element={<Quotas />} />
            <Route path="/tenant-admin/audit" element={<AuditLog />} />
            <Route path="/tenant-admin/settings" element={<Settings />} />
            <Route path="/tenant-admin/reports/:id" element={<ReportDetail />} />
            <Route path="/tenant-admin/infra-providers" element={<TenantInfraProviders />} />
            <Route path="/tenant-admin/provider-requests/:id" element={<ProviderRequestDetail />} />
            <Route path="/tenant-admin/provider-requests" element={<Navigate to="/tenant-admin/requests?type=provider" replace />} />
            <Route path="/tenant-admin/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="user" />}>
          <Route element={<AppShell />}>
            <Route path="/app" element={<UserDashboard />} />
            <Route path="/app/projects" element={<Projects />} />
            <Route path="/app/projects/new" element={<NewProject />} />
            <Route path="/app/projects/:id" element={<ProjectDetail />} />
            <Route path="/app/environments/new" element={<NewEnvironment />} />
            <Route path="/app/environments/:id/edit" element={<NewEnvironment />} />
            <Route path="/app/environments/:id" element={<EnvironmentDetail />} />
            <Route path="/app/catalog" element={<UserCatalog />} />
            <Route path="/app/catalog/:id" element={<CatalogDetail />} />
            <Route path="/app/testing" element={<Testing />} />
            <Route path="/app/monitoring" element={<Monitoring />} />
            <Route path="/app/requests" element={<MyRequests />} />
            <Route path="/app/requests/:id" element={<RequestDetail />} />
            <Route path="/app/suggestions/:id" element={<SuggestionDetail />} />
            <Route path="/app/reports/:id" element={<ReportDetail />} />
            <Route path="/app/provider-requests/:id" element={<ProviderRequestDetail />} />
            <Route path="/app/provider-requests" element={<Navigate to="/app/requests?type=provider" replace />} />
            <Route path="/app/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="qa" />}>
          <Route element={<AppShell />}>
            <Route path="/qa" element={<QaDashboard />} />
            <Route path="/qa/model-testing" element={<ModelTesting />} />
            <Route path="/qa/comparison" element={<ModelComparison />} />
            <Route path="/qa/configurations" element={<TestConfigurations />} />
            <Route path="/qa/functional" element={<EnvironmentTesting mode="functional" />} />
            <Route path="/qa/load" element={<EnvironmentTesting mode="load" />} />
            <Route path="/qa/reports" element={<TestReports />} />
            <Route path="/qa/reports/:id" element={<ReportDetail />} />
            <Route path="/qa/monitoring" element={<Monitoring />} />
            <Route path="/qa/environments/:id" element={<EnvironmentDetail />} />
            <Route path="/qa/catalog/:id" element={<CatalogDetail />} />
            <Route path="/qa/*" element={<NotFound />} />
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/environments/:id/terminal" element={<TerminalPage />} />
        </Route>
        <Route path="/reports/:id" element={<SharedReportRedirect />} />
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
