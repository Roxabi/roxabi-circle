/**
 * Run detail shared by the admin and app routes. Timeline is the receipt record — not a second log.
 * Approve/reject when GET run allowedOperations.decideApproval is true (Roxabi/roxabi-boilerplate-cf#288).
 */
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@kit/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PageHeader } from '../../components/app-shell'
import {
  type FlowRunResponse,
  fetchFlowRun,
  flowRunQueryKey,
  type TimelineStep,
  timelineFromReceipts,
} from '../../lib/flows'
import { useLocale } from '../../lib/locale'
import { useOrgContext } from '../../lib/org-context'
import { flowErrorLabel, flowOutcomeLabel, flowStatusLabel } from '../../messages/flows-catalog'
import { FlowRunApproveActions } from './flow-run-approve'
import { FlowsQueryError } from './flows-denial'

function FlowRunStepRow({
  step,
  orgId,
  runId,
  canDecide,
  m,
}: {
  step: TimelineStep
  orgId: string
  runId: string
  canDecide: boolean
  m: ReturnType<typeof useLocale>['m']
}) {
  return (
    <li
      key={step.taskId}
      data-task-id={step.taskId}
      data-outcome={step.outcome}
      className="rounded-md border px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{step.taskId}</span>
        <Badge variant={step.outcome === 'fail' ? 'destructive' : 'secondary'}>
          {flowOutcomeLabel(step.outcome, m)}
        </Badge>
      </div>
      {step.approval ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {m.flowsApproval.replace('{by}', step.approval.by).replace('{at}', step.approval.at)}
        </p>
      ) : null}
      {step.errorCode ? (
        <p className="mt-1 text-xs text-destructive">{flowErrorLabel(step.errorCode, m)}</p>
      ) : null}
      {step.output ? (
        <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{step.output}</pre>
      ) : null}
      {orgId && step.outcome === 'waiting' && !step.approval ? (
        <FlowRunApproveActions
          orgId={orgId}
          runId={runId}
          taskId={step.taskId}
          enabled={canDecide}
        />
      ) : null}
    </li>
  )
}

function FlowRunLoadedCard({
  orgId,
  runId,
  run,
  m,
}: {
  orgId: string
  runId: string
  run: FlowRunResponse
  m: ReturnType<typeof useLocale>['m']
}) {
  const steps = timelineFromReceipts(run.run.receipts)
  const canDecide = run.allowedOperations?.decideApproval === true
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="font-mono text-sm">{run.run.id}</span>
          <Badge variant="outline" data-testid="flow-run-status">
            {flowStatusLabel(run.run.status, m)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.run.errorCode ? (
          <p className="text-sm text-destructive">{flowErrorLabel(run.run.errorCode, m)}</p>
        ) : null}
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.flowsNoSteps}</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((step) => (
              <FlowRunStepRow
                key={step.taskId}
                step={step}
                orgId={orgId}
                runId={runId}
                canDecide={canDecide}
                m={m}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function FlowRunQueryBody({
  orgId,
  runId,
  run,
  m,
}: {
  orgId: string | null
  runId: string
  run: {
    isLoading: boolean
    isError: boolean
    error: unknown
    data?: FlowRunResponse
    refetch: () => unknown
  }
  m: ReturnType<typeof useLocale>['m']
}) {
  if (!orgId) return <p className="text-sm text-muted-foreground">{m.flowsNeedOrg}</p>
  if (run.isLoading) return <Skeleton className="h-24 w-full" />
  if (run.isError) {
    return (
      <FlowsQueryError
        error={run.error}
        onRetry={() => {
          void run.refetch()
        }}
      />
    )
  }
  if (!run.data) return null
  return <FlowRunLoadedCard orgId={orgId} runId={runId} run={run.data} m={m} />
}

export function AdminFlowRunPage({
  runId,
  showAdminBack = true,
}: {
  runId: string
  showAdminBack?: boolean
}) {
  const { m } = useLocale()
  const { activeOrgId: orgId } = useOrgContext()

  const run = useQuery({
    queryKey: orgId ? flowRunQueryKey(orgId, runId) : ['flows', 'run', 'none', runId],
    enabled: Boolean(orgId),
    queryFn: () => fetchFlowRun(orgId!, runId),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.navFlows}
        description={m.flowsTimeline}
        actions={
          showAdminBack ? (
            <Link to="/admin/flows" className="text-sm font-medium text-primary hover:underline">
              {m.flowsBack}
            </Link>
          ) : undefined
        }
      />
      <FlowRunQueryBody orgId={orgId} runId={runId} run={run} m={m} />
    </div>
  )
}
