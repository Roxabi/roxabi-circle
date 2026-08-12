import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fr } from '../messages/fr'
import { TaskCommentsPanel } from './tasks-comments-panel'

afterEach(() => {
  cleanup()
})

describe('TaskCommentsPanel', () => {
  it('shows loadFailed + retry when isError (not empty success)', () => {
    const onRetry = vi.fn()
    render(
      <TaskCommentsPanel
        m={fr}
        selectedId="task_1"
        comments={undefined}
        loading={false}
        isError
        error={new Error('boom')}
        onRetry={onRetry}
        commentBody=""
        onCommentBodyChange={() => {}}
        onAddComment={() => {}}
        pending={false}
      />,
    )
    expect(screen.queryByText(fr.taskCommentsEmpty)).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(fr.loadFailed)).toBeTruthy()
    screen.getByRole('button', { name: fr.retry }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
