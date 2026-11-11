/**
 * Advisory HITL controls. Server POST re-checks; UI follows allowedOperations (Roxabi/roxabi-boilerplate-cf#288).
 */
import { Button } from '@kit/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiErrorToMessage } from '../../lib/api'
import { type FlowApprovalDecision, flowRunQueryKey, postFlowApproval } from '../../lib/flows'
import { useLocale } from '../../lib/locale'

export function FlowRunApproveActions(props: {
  orgId: string
  runId: string
  taskId: string
  enabled: boolean
}) {
  const { m } = useLocale()
  const qc = useQueryClient()
  const decide = useMutation({
    mutationFn: (vars: {
      orgId: string
      runId: string
      taskId: string
      decision: FlowApprovalDecision
    }) => postFlowApproval(vars.orgId, vars.runId, vars.taskId, vars.decision),
    onSuccess: async (_data, vars) => {
      toast.success(m.flowsDecisionRecorded)
      await qc.invalidateQueries({ queryKey: flowRunQueryKey(vars.orgId, vars.runId) })
    },
    onError: (err) => toast.error(m.error, { description: apiErrorToMessage(err, m) }),
  })

  if (!props.enabled) return null

  return (
    <div className="mt-2 flex gap-2">
      <Button
        type="button"
        size="sm"
        disabled={decide.isPending}
        data-testid={`flow-approve-${props.taskId}`}
        onClick={() =>
          decide.mutate({
            orgId: props.orgId,
            runId: props.runId,
            taskId: props.taskId,
            decision: 'approved',
          })
        }
      >
        {m.flowsApprove}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={decide.isPending}
        data-testid={`flow-reject-${props.taskId}`}
        onClick={() =>
          decide.mutate({
            orgId: props.orgId,
            runId: props.runId,
            taskId: props.taskId,
            decision: 'rejected',
          })
        }
      >
        {m.flowsReject}
      </Button>
    </div>
  )
}
