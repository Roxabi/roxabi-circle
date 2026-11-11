import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { FlowPlan, FlowPlansResponse, FlowRunsResponse } from '../../lib/flows'
import type { useLocale } from '../../lib/locale'
import { flowStatusLabel } from '../../messages/flows-catalog'

function FlowPlanRow({
  plan,
  canToggle,
  canRun,
  togglePending,
  runPending,
  onToggle,
  onRun,
  m,
}: {
  plan: FlowPlan
  canToggle: boolean
  canRun: boolean
  togglePending: boolean
  runPending: boolean
  onToggle: (enabled: boolean) => void
  onRun: () => void
  m: ReturnType<typeof useLocale>['m']
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{plan.planKey}</div>
        <div className="font-mono text-xs text-muted-foreground">v{plan.version}</div>
      </TableCell>
      <TableCell>
        {canToggle ? (
          <Switch
            checked={plan.enabled}
            disabled={togglePending}
            aria-label={plan.planKey}
            onCheckedChange={onToggle}
          />
        ) : (
          <Badge variant="outline">{plan.enabled ? m.moduleOn : m.moduleOff}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {canRun && plan.enabled ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label={`${m.flowsRun} ${plan.planKey}`}
            disabled={runPending}
            onClick={onRun}
          >
            {m.flowsRun}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

export function FlowsPlansCard({
  orgId,
  orgName,
  plans,
  canToggle,
  canRun,
  toggle,
  queueRun,
  m,
}: {
  orgId: string
  orgName: string | undefined
  plans: UseQueryResult<FlowPlansResponse>
  canToggle: boolean
  canRun: boolean
  toggle: {
    isPending: boolean
    mutate: (vars: { orgId: string; planId: string; enabled: boolean }) => void
  }
  queueRun: { isPending: boolean; mutate: (vars: { orgId: string; planId: string }) => void }
  m: ReturnType<typeof useLocale>['m']
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.flowsPlans}</CardTitle>
        <CardDescription>{orgName}</CardDescription>
      </CardHeader>
      <CardContent>
        {plans.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (plans.data?.plans.length ?? 0) === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m.flowsEmptyPlans}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.flowsPlans}</TableHead>
                <TableHead>{m.moduleOn}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.data?.plans.map((plan) => (
                <FlowPlanRow
                  key={plan.id}
                  plan={plan}
                  canToggle={canToggle}
                  canRun={canRun}
                  togglePending={toggle.isPending}
                  runPending={queueRun.isPending}
                  onToggle={(checked) =>
                    toggle.mutate({ orgId, planId: plan.id, enabled: checked })
                  }
                  onRun={() => queueRun.mutate({ orgId, planId: plan.id })}
                  m={m}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function FlowsRunsCard({
  runs,
  m,
}: {
  runs: UseQueryResult<FlowRunsResponse>
  m: ReturnType<typeof useLocale>['m']
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.flowsRuns}</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (runs.data?.runs.length ?? 0) === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{m.flowsEmptyRuns}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.flowsStatus}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.data?.runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{run.id}</div>
                    <Badge variant="outline">{flowStatusLabel(run.status, m)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/admin/flows/runs/$runId"
                      params={{ runId: run.id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {m.flowsOpen}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
