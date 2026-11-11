import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Textarea,
} from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import { apiErrorFieldErrors, apiErrorToMessage, fieldErrorsFirstMessages } from '../lib/api'
import { useLocale } from '../lib/locale'
import { useCreateNote } from '../lib/notes'
import { createNoteSchema } from '../lib/schemas'

export function NotesCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { m } = useLocale()
  const createNote = useCreateNote()

  const form = useForm({
    defaultValues: { title: '', body: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createNoteSchema.safeParse(value)
        if (parsed.success) return
        const flat = parsed.error.flatten().fieldErrors
        return {
          form: m.errValidation,
          fields: {
            title: flat.title?.[0] ? m.errValidation : undefined,
            body: flat.body?.[0] ? m.errValidation : undefined,
          },
        }
      },
    },
    onSubmit: async ({ value }) => {
      // Reset/close only after success — keep draft if the API rejects.
      try {
        await createNote.mutateAsync(value)
        toast.success(m.noteCreated)
        form.reset()
        onOpenChange(false)
      } catch (e) {
        // Wire fieldErrors (kit ValidationDetails) → form field state; toast if no mapped fields.
        const fe = apiErrorFieldErrors(e)
        if (fe) {
          const fields = fieldErrorsFirstMessages(fe)
          const titleMsg = fields.title
          const bodyMsg = fields.body
          if (titleMsg || bodyMsg) {
            form.setErrorMap({
              onSubmit: {
                form: apiErrorToMessage(e, m),
                fields: {
                  title: titleMsg,
                  body: bodyMsg,
                },
              },
            })
            return
          }
        }
        toast.error(m.error, { description: apiErrorToMessage(e, m) })
      }
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) form.reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.createNote}</DialogTitle>
          <DialogDescription>{m.notesDesc}</DialogDescription>
        </DialogHeader>
        <form
          id="create-note"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="title">
            {(field) => {
              const err = field.state.meta.errors[0]
              const errId = `${field.name}-error`
              const invalid = Boolean(err)
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>{m.title}</FieldLabel>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? errId : undefined}
                  />
                  {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="body">
            {(field) => {
              const err = field.state.meta.errors[0]
              const errId = `${field.name}-error`
              const invalid = Boolean(err)
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>{m.body}</FieldLabel>
                  <Textarea
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    rows={4}
                    placeholder={m.noteBodyHint}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? errId : undefined}
                  />
                  {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                </Field>
              )
            }}
          </form.Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {m.cancel}
          </Button>
          <Button type="submit" form="create-note" disabled={createNote.isPending}>
            {m.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
