import { type CSSProperties, useEffect, useId, useState } from 'react'
import {
  FEEDBACK_DEFAULT_PRIORITY,
  FEEDBACK_DEFAULT_TYPE,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
} from '../constants'
import { buildClientFormData } from '../form'
import type { FeedbackPriority, FeedbackType } from '../types'

export type FeedbackTheme = 'zinc' | 'warm' | 'dark' | 'custom'

export type FeedbackButtonLabels = {
  trigger?: string
  title?: string
  success?: string
  successSub?: string
  hint?: string
  typeBug?: string
  typeFeature?: string
  priorityUrgent?: string
  priorityNormal?: string
  priorityLater?: string
  titlePlaceholderBug?: string
  titlePlaceholderFeature?: string
  bodyPlaceholder?: string
  addCapture?: string
  removeImage?: string
  close?: string
  cancel?: string
  send?: string
  sending?: string
  titleRequired?: string
  sendFailed?: string
}

export type FeedbackButtonProps = {
  /** Route proxy host (défaut `/api/report`). */
  endpoint?: string
  theme?: FeedbackTheme
  style?: CSSProperties
  className?: string
  labels?: FeedbackButtonLabels
}

type FileItem = { id: string; file: File }

const DEFAULT_LABELS: Required<FeedbackButtonLabels> = {
  trigger: 'Signaler',
  title: 'Signaler un bug ou une idée',
  success: 'Merci ! Signalement envoyé.',
  successSub: "L'équipe le retrouve dans le Pilotage Spark.",
  hint: 'Envoyé avec la page en cours.',
  typeBug: 'Bug',
  typeFeature: 'Amélioration',
  priorityUrgent: 'Urgent',
  priorityNormal: 'Normal',
  priorityLater: 'Plus tard',
  titlePlaceholderBug: "Que s'est-il passé ?",
  titlePlaceholderFeature: 'Quelle amélioration ?',
  bodyPlaceholder: 'Détaille un peu (étapes, ce que tu attendais…)',
  addCapture: 'Ajouter une capture',
  removeImage: "Retirer l'image",
  close: 'Fermer',
  cancel: 'Annuler',
  send: 'Envoyer',
  sending: 'Envoi…',
  titleRequired: 'Donne un titre court.',
  sendFailed: "Échec de l'envoi.",
}

export function FeedbackButton({
  endpoint = '/api/report',
  theme = 'zinc',
  style,
  className,
  labels: labelsIn,
}: FeedbackButtonProps) {
  const titleId = useId()
  const L = { ...DEFAULT_LABELS, ...labelsIn }
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>(FEEDBACK_DEFAULT_TYPE)
  const [priority, setPriority] = useState<FeedbackPriority>(FEEDBACK_DEFAULT_PRIORITY)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [done, setDone] = useState(false)

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f.file))
    setPreviews(urls)
    return () => {
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [files])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function reset() {
    setType(FEEDBACK_DEFAULT_TYPE)
    setPriority(FEEDBACK_DEFAULT_PRIORITY)
    setTitle('')
    setBody('')
    setFiles([])
    setErr(undefined)
    setDone(false)
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const imgs: FileItem[] = Array.from(list)
      .filter((f) => f.type.startsWith('image/') && f.size <= FEEDBACK_MAX_IMAGE_BYTES)
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
      }))
    setFiles((p) => [...p, ...imgs].slice(0, FEEDBACK_MAX_IMAGES))
  }

  async function submit() {
    if (busy) return
    if (!title.trim()) {
      setErr(L.titleRequired)
      return
    }
    setErr(undefined)
    setBusy(true)
    try {
      const fd = buildClientFormData({
        type,
        priority,
        title,
        body,
        // Pathname only — never forward query (tokens, invite ids, debug params).
        page: typeof location !== 'undefined' ? location.pathname : '',
        agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        files: files.map((f) => f.file),
      })
      const res = await fetch(endpoint, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      setBusy(false)
      if (res.ok) setDone(true)
      else setErr(d.error || L.sendFailed)
    } catch {
      setBusy(false)
      setErr(L.sendFailed)
    }
  }

  const rootClass = ['sf-root', className].filter(Boolean).join(' ')

  return (
    <div className={rootClass} data-sf-theme={theme === 'custom' ? undefined : theme} style={style}>
      <button
        type="button"
        className="sf-trigger"
        title={L.title}
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <span aria-hidden>💬</span> {L.trigger}
      </button>

      {open ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss — DEBT:modal-a11y-backdrop
        <div
          className="sf-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="sf-dialog"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="sf-header">
              <h2 id={titleId} className="sf-title">
                {L.title}
              </h2>
              <button
                type="button"
                className="sf-icon-btn"
                onClick={() => setOpen(false)}
                aria-label={L.close}
              >
                ✕
              </button>
            </div>

            {done ? (
              <div className="sf-success">
                <p>{L.success}</p>
                <p className="sf-success-sub">{L.successSub}</p>
                <button
                  type="button"
                  className="sf-btn sf-btn-primary"
                  onClick={() => setOpen(false)}
                >
                  {L.close}
                </button>
              </div>
            ) : (
              <>
                <div className="sf-body">
                  <div className="sf-row">
                    {(
                      [
                        ['bug', L.typeBug],
                        ['feature', L.typeFeature],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className="sf-chip"
                        data-active={type === k}
                        onClick={() => setType(k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="sf-row">
                    <span className="sf-label">Priorité</span>
                    {(
                      [
                        ['p1', L.priorityUrgent],
                        ['p2', L.priorityNormal],
                        ['p3', L.priorityLater],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className="sf-chip"
                        data-active={priority === k}
                        onClick={() => setPriority(k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    // biome-ignore lint/a11y/noAutofocus: intentional modal focus — DEBT:modal-a11y-autofocus
                    autoFocus
                    className="sf-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={type === 'bug' ? L.titlePlaceholderBug : L.titlePlaceholderFeature}
                  />
                  <textarea
                    className="sf-textarea"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder={L.bodyPlaceholder}
                  />
                  <div>
                    {files.length > 0 ? (
                      <div className="sf-previews">
                        {files.map((f, i) => (
                          <div key={f.id} className="sf-preview">
                            <img src={previews[i]} alt={f.file.name} />
                            <button
                              type="button"
                              className="sf-preview-remove"
                              aria-label={L.removeImage}
                              onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {files.length < FEEDBACK_MAX_IMAGES ? (
                      <label className="sf-file-label">
                        {L.addCapture}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            addFiles(e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  {err ? <p className="sf-error">{err}</p> : null}
                  <p className="sf-hint">{L.hint}</p>
                </div>
                <div className="sf-footer">
                  <button
                    type="button"
                    className="sf-btn sf-btn-ghost"
                    onClick={() => setOpen(false)}
                  >
                    {L.cancel}
                  </button>
                  <button
                    type="button"
                    className="sf-btn sf-btn-primary"
                    disabled={busy}
                    onClick={submit}
                  >
                    {busy ? L.sending : L.send}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
