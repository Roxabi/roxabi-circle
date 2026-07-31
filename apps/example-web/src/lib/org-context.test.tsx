import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MeResponse } from './auth'
import { OrgProvider, useOrgContext } from './org-context'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function Probe() {
  const { orgs, activeOrgId } = useOrgContext()
  return (
    <div>
      <span data-testid="count">{orgs.length}</span>
      <span data-testid="active">{activeOrgId ?? 'null'}</span>
    </div>
  )
}

const meWithOrgs: MeResponse = {
  subject: 'user_x',
  authMethod: 'session',
  role: 'user',
  platformRole: null,
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
    localStorage.setItem('gosilex.activeOrgId', 'org_b')
    render(
      <OrgProvider me={meWithOrgs}>
        <Probe />
      </OrgProvider>,
    )
    expect(screen.getByTestId('active').textContent).toBe('org_b')
  })

  it('resets invalid stored org id', () => {
    localStorage.setItem('gosilex.activeOrgId', 'org_gone')
    render(
      <OrgProvider me={meWithOrgs}>
        <Probe />
      </OrgProvider>,
    )
    expect(screen.getByTestId('active').textContent).toBe('org_a')
  })
})
