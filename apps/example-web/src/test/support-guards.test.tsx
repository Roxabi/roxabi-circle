import { screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { assertNoUnexpectedApiRequests, createApiDispatcher } from './api-mock'
import { renderWithAppProviders } from './render'
import { allowRuntimeError, assertNoUndeclaredRuntimeErrors } from './runtime-errors'

const originalConsoleError = console.error

afterAll(() => {
  console.error = originalConsoleError
})

type BoundaryProps = {
  children: ReactNode
  fallback: string
}

type BoundaryState = {
  hasError: boolean
}

class RenderErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? <p>{this.props.fallback}</p> : this.props.children
  }
}

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message)
}

function renderThrowingComponent(message: string, fallback: string): void {
  renderWithAppProviders(
    <RenderErrorBoundary fallback={fallback}>
      <ThrowingComponent message={message} />
    </RenderErrorBoundary>,
  )
}

describe('test support guards', { concurrent: false, shuffle: false }, () => {
  it('fails a caught render error after the boundary renders its fallback', () => {
    vi.spyOn(console, 'error')
    renderThrowingComponent('caught render error', 'caught fallback')

    expect(screen.getByText('caught fallback')).toBeVisible()
    expect(() => assertNoUndeclaredRuntimeErrors()).toThrow('caught render error')
  })

  it('does not let a caller callback hide a caught render error', () => {
    renderWithAppProviders(
      <RenderErrorBoundary fallback="callback fallback">
        <ThrowingComponent message="callback render error" />
      </RenderErrorBoundary>,
      { onCaughtError: () => {} },
    )

    expect(screen.getByText('callback fallback')).toBeVisible()
    expect(() => assertNoUndeclaredRuntimeErrors()).toThrow('callback render error')
  })

  it('accepts a caught render error declared by the caller callback', () => {
    renderWithAppProviders(
      <RenderErrorBoundary fallback="declared callback fallback">
        <ThrowingComponent message="declared callback error" />
      </RenderErrorBoundary>,
      { onCaughtError: (error) => allowRuntimeError((observed) => observed === error) },
    )

    expect(screen.getByText('declared callback fallback')).toBeVisible()
  })

  it('accepts one declared render error after its boundary renders the fallback', () => {
    allowRuntimeError('declared render error')
    renderThrowingComponent('declared render error', 'declared fallback')

    expect(screen.getByText('declared fallback')).toBeVisible()
  })

  it.each(['g', 'y'])('preserves caller state for a %s RegExp allowance', (flags) => {
    const matcher = new RegExp('^stateful render error$', flags)
    matcher.lastIndex = 1
    allowRuntimeError(matcher)
    renderThrowingComponent('stateful render error', 'stateful fallback')

    expect(screen.getByText('stateful fallback')).toBeVisible()
    assertNoUndeclaredRuntimeErrors()
    expect(matcher.lastIndex).toBe(1)
  })

  it('fails when an allowed runtime error was not observed', () => {
    allowRuntimeError('missing declared error')

    expect(() => assertNoUndeclaredRuntimeErrors()).toThrow(
      'Expected runtime error was not observed: missing declared error',
    )
  })

  it('does not let a declared error allow a different caught render error', () => {
    allowRuntimeError('declared error')
    renderThrowingComponent('unexpected render error', 'unexpected fallback')

    expect(screen.getByText('unexpected fallback')).toBeVisible()
    expect(() => assertNoUndeclaredRuntimeErrors()).toThrow(
      /unexpected render error[\s\S]*Expected runtime error was not observed: declared error/,
    )
  })

  it('does not let a stateful RegExp allowance cover a different error', () => {
    allowRuntimeError(/^declared regexp error$/gy)
    renderThrowingComponent('unexpected regexp error', 'regexp fallback')

    expect(screen.getByText('regexp fallback')).toBeVisible()
    expect(() => assertNoUndeclaredRuntimeErrors()).toThrow(
      /unexpected regexp error[\s\S]*Expected runtime error was not observed:/,
    )
  })

  it('fails teardown for an unknown caught API request', async () => {
    const dispatcher = createApiDispatcher()
    let caught: unknown

    try {
      await dispatcher.fetch('/api/not-declared', { method: 'POST' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(() => assertNoUnexpectedApiRequests()).toThrow(
      'Unexpected API request: POST /api/not-declared',
    )
  })
})
