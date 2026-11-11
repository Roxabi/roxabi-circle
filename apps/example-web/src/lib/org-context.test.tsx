import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MeResponse } from './auth'
import { OrgProvider, useOrgContext } from './org-context'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function Probe() {
  const { activeOrgId } = useOrgContext()
  const seen = useRef<string[]>([])
  seen.current.push(activeOrgId ?? 'null')
  return (
    <div>
      <span data-testid="count">{useOrgContext().orgs.length}</span>
      <span data-testid="active">{activeOrgId ?? 'null'}</span>
      <span data-testid="seen">{seen.current.join(',')}</span>
    </div>
  )
}

const meWithOrgs: MeResponse = {
  subject: 'user_x',
  authMethod: 'session',
  platformRole: null,
  impersonation: null,
  impersonationPermissions: { read: false, write: false },
  requestId: 'r',
  orgs: [
    {
      id: 'org_a',
      name: 'A',
      slug: 'a',
      kind: 'client',
      status: 'active',
      role: 'owner',
    },
    {
      id: 'org_b',
      name: 'B',
      slug: 'b',
      kind: 'client',
      status: 'active',
      role: 'member',
    },
  ],
}

describe('OrgProvider / useOrgContext', () => {
  it('throws outside provider', () => {
    expect(() => render(<Probe />)).toThrow(/OrgProvider/)
  })

  it('selects first org when storage empty', () => {
    render(
      <OrgProvider me={meWithOrgs}>
        <Probe />
      </OrgProvider>,
    )
    expect(screen.getByTestId('count').textContent).toBe('2')
    expect(screen.getByTestId('active').textContent).toBe('org_a')
  })

  it('keeps valid stored org id', () => {
    localStorage.setItem('kit.activeOrgId', 'org_b')
    render(
      <OrgProvider me={meWithOrgs}>
        <Probe />
      </OrgProvider>,
    )
    expect(screen.getByTestId('active').textContent).toBe('org_b')
  })

  it('never exposes a stale stored org id, including on the first render', () => {
    localStorage.setItem('kit.activeOrgId', 'org_gone')
    render(
      <OrgProvider me={meWithOrgs}>
        <Probe />
      </OrgProvider>,
    )
    expect(screen.getByTestId('seen').textContent).toBe('org_a')
    expect(screen.getByTestId('active').textContent).toBe('org_a')
    expect(screen.getByTestId('seen').textContent).not.toContain('org_gone')
  })
})
