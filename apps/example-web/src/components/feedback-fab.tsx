import { FeedbackButton } from '@kit/feedback/react'
import '@kit/feedback/styles.css'
import { useLocale } from '../lib/locale'
import { isModuleOn, useModules } from '../lib/modules'

/** Floating « Signaler » — gated by D1 kit_modules.feedback (GET /api/modules). */
export function FeedbackFab() {
  const { m } = useLocale()
  const modules = useModules()
  if (!isModuleOn(modules.data?.modules, 'feedback')) return null

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
