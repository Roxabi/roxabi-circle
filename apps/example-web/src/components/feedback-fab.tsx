import { FeedbackButton } from '@gosilex/feedback/react'
import '@gosilex/feedback/styles.css'
import { useLocale } from '../lib/locale'

function isFeedbackUiEnabled(): boolean {
  const v = (import.meta.env.VITE_FEEDBACK_ENABLED ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

/** Floating « Signaler » — gated by VITE_FEEDBACK_ENABLED (mirror API FEEDBACK_ENABLED). */
export function FeedbackFab() {
  const { m } = useLocale()
  if (!isFeedbackUiEnabled()) return null

  return (
    <FeedbackButton
      theme="zinc"
      labels={{
        trigger: m.feedbackTrigger,
        title: m.feedbackTitle,
        success: m.feedbackSuccess,
        successSub: m.feedbackSuccessSub,
        hint: m.feedbackHint,
        typeBug: m.feedbackTypeBug,
        typeFeature: m.feedbackTypeFeature,
        priorityUrgent: m.feedbackPriorityUrgent,
        priorityNormal: m.feedbackPriorityNormal,
        priorityLater: m.feedbackPriorityLater,
        titlePlaceholderBug: m.feedbackTitlePlaceholderBug,
        titlePlaceholderFeature: m.feedbackTitlePlaceholderFeature,
        bodyPlaceholder: m.feedbackBodyPlaceholder,
        addCapture: m.feedbackAddCapture,
        removeImage: m.feedbackRemoveImage,
        close: m.feedbackClose,
        cancel: m.cancel,
        send: m.feedbackSend,
        sending: m.feedbackSending,
        titleRequired: m.feedbackTitleRequired,
        sendFailed: m.feedbackSendFailed,
      }}
    />
  )
}
