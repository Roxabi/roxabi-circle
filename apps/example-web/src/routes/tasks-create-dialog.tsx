import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import type { Messages } from '../messages/fr'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Messages
  pending: boolean
  onSubmit: (input: {
    title: string
    description?: string
    visibility: 'internal' | 'shared'
    boardKey: string
  }) => Promise<void>
}

export function TaskCreateDialog({ open, onOpenChange, m, pending, onSubmit }: Props) {
  const form = useForm({
    defaultValues: {
      title: '',
      description: '',
      visibility: 'shared' as 'internal' | 'shared',
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        title: value.title.trim(),
        description: value.description.trim() || undefined,
        visibility: value.visibility,
        boardKey: 'main',
      })
      form.reset()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.taskCreate}</DialogTitle>
          <DialogDescription>{m.tasksDesc}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="title">
            {(field) => (
              <Field>
                <FieldLabel>{m.taskTitle}</FieldLabel>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel>{m.taskDescription}</FieldLabel>
                <Textarea
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  rows={3}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="visibility">
            {(field) => (
              <Field>
                <FieldLabel>{m.taskVisibility}</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(v) =>
                    field.handleChange((v as 'internal' | 'shared') ?? 'shared')
                  }
                  items={[
                    { label: m.taskVisibilityShared, value: 'shared' },
                    { label: m.taskVisibilityInternal, value: 'internal' },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="shared">{m.taskVisibilityShared}</SelectItem>
                      <SelectItem value="internal">{m.taskVisibilityInternal}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {m.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {m.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
