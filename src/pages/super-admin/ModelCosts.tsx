import { useScope } from '@/store/selectors'
import { useAppStore } from '@/store/useAppStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { ModelCosts } from '@/components/shared/ModelCosts'

/** Super Admin: model costs across all tenants, narrowed by the tenant filter in the top bar. */
export default function SuperAdminModelCosts() {
  const scope = useScope()!
  const tenant = useAppStore((s) => s.tenants.find((t) => t.id === scope.tenantId))
  return (
    <>
      <PageHeader
        eyebrow={tenant ? tenant.name : 'All organisations'}
        title="Model Costs"
        description="What platform models cost each organisation, by model, provider, project and person. Use the tenant filter to focus on one organisation."
      />
      <ModelCosts tenantId={scope.tenantId} />
    </>
  )
}
