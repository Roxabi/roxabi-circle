import { describe, expect, it } from 'vitest'
import {
  applyClose,
  applyHttpAuthFailure,
  applyInvalidSession,
  applyReady,
  applyResumed,
  backoffMs,
  canResume,
  clearCircuit,
  emptyGatewaySession,
  HARD_STOP_CLOSE_CODES,
  hydrateGatewaySession,
  planConnect,
} from '../src/discord/gateway-session'

describe('backoffMs', () => {
  it('grows then caps at 15m', () => {
    expect(backoffMs(0)).toBe(5_000)
    expect(backoffMs(1)).toBe(15_000)
    expect(backoffMs(2)).toBe(30_000)
    expect(backoffMs(6)).toBe(900_000)
    expect(backoffMs(99)).toBe(900_000)
  })
})

describe('canResume', () => {
  it('requires sessionId and seq', () => {
    const s = emptyGatewaySession()
    expect(canResume(s)).toBe(false)
    s.sessionId = 'abc'
    expect(canResume(s)).toBe(false)
    s.seq = 0
    expect(canResume(s)).toBe(true)
  })
})

describe('planConnect', () => {
  const now = 1_000_000

  it('skips when socket busy', () => {
    expect(planConnect({ now, session: emptyGatewaySession(), socketBusy: true })).toEqual({
      action: 'skip',
      reason: 'socket_busy',
    })
  })

  it('hard_stop without force', () => {
    const session = { ...emptyGatewaySession(), hardStop: true, lastError: 'auth' }
    expect(planConnect({ now, session, socketBusy: false })).toEqual({
      action: 'hard_stop',
      reason: 'auth',
    })
  })

  it('force bypasses hard_stop and backoff', () => {
    const session = {
      ...emptyGatewaySession(),
      hardStop: true,
      nextConnectAt: now + 99_000,
    }
    expect(planConnect({ now, session, socketBusy: false, force: true })).toEqual({
      action: 'connect',
      reason: 'force',
    })
  })

  it('waits during backoff', () => {
    const session = { ...emptyGatewaySession(), nextConnectAt: now + 10_000 }
    expect(planConnect({ now, session, socketBusy: false })).toEqual({
      action: 'wait',
      until: now + 10_000,
      reason: 'backoff',
    })
  })

  it('connects when clear', () => {
    expect(planConnect({ now, session: emptyGatewaySession(), socketBusy: false })).toEqual({
      action: 'connect',
      reason: 'ok',
    })
  })
})

describe('applyClose', () => {
  const now = 5_000

  it('hard-stops on auth close codes', () => {
    for (const code of HARD_STOP_CLOSE_CODES) {
      const { session, alarmAt } = applyClose({
        session: emptyGatewaySession(),
        now,
        code,
        reason: 'auth',
      })
      expect(session.hardStop).toBe(true)
      expect(session.sessionId).toBeNull()
      expect(alarmAt).toBeNull()
    }
  })

  it('schedules exponential backoff otherwise', () => {
    const session = emptyGatewaySession()
    session.sessionId = 's1'
    session.seq = 3
    const r1 = applyClose({ session, now, code: 1006 })
    expect(r1.session.hardStop).toBe(false)
    expect(r1.session.failCount).toBe(1)
    expect(r1.alarmAt).toBe(now + 5_000)
    expect(r1.session.sessionId).toBe('s1') // keep resume material

    const r2 = applyClose({ session: r1.session, now: now + 5_000, code: 1006 })
    expect(r2.session.failCount).toBe(2)
    expect(r2.alarmAt).toBe(now + 5_000 + 15_000)
  })

  it('clears resume on invalid seq / session timeout', () => {
    const base = {
      ...emptyGatewaySession(),
      sessionId: 's',
      seq: 9,
      resumeUrl: 'wss://x',
    }
    for (const code of [4007, 4009]) {
      const { session } = applyClose({ session: base, now, code })
      expect(session.sessionId).toBeNull()
      expect(session.seq).toBeNull()
    }
  })
})

describe('applyReady / applyResumed / invalid session', () => {
  const now = 10_000

  it('ready resets circuit', () => {
    const dirty = {
      ...emptyGatewaySession(),
      failCount: 5,
      hardStop: true,
      nextConnectAt: now + 1,
    }
    const s = applyReady({
      session: dirty,
      now,
      sessionId: 'sid',
      resumeUrl: 'wss://resume',
      seq: 1,
    })
    expect(s.failCount).toBe(0)
    expect(s.hardStop).toBe(false)
    expect(s.sessionId).toBe('sid')
    expect(s.resumeUrl).toBe('wss://resume')
  })

  it('resumed resets circuit and keeps session', () => {
    const base = {
      ...emptyGatewaySession(),
      sessionId: 'sid',
      seq: 10,
      failCount: 2,
    }
    const s = applyResumed({ session: base, now, seq: 12 })
    expect(s.seq).toBe(12)
    expect(s.failCount).toBe(0)
    expect(s.sessionId).toBe('sid')
  })

  it('invalid session false drops resume', () => {
    const base = {
      ...emptyGatewaySession(),
      sessionId: 'sid',
      seq: 1,
      resumeUrl: 'wss://r',
    }
    const s = applyInvalidSession(base, false, now)
    expect(s.sessionId).toBeNull()
    expect(s.seq).toBeNull()
    expect(s.nextConnectAt).toBeGreaterThan(now)
  })

  it('invalid session true keeps resume with short wait', () => {
    const base = {
      ...emptyGatewaySession(),
      sessionId: 'sid',
      seq: 1,
    }
    const s = applyInvalidSession(base, true, now)
    expect(s.sessionId).toBe('sid')
    expect(s.nextConnectAt).toBe(now + 2_000)
  })
})

describe('clearCircuit / http auth', () => {
  it('clearCircuit for ops force', () => {
    const s = clearCircuit({
      ...emptyGatewaySession(),
      hardStop: true,
      failCount: 9,
      nextConnectAt: 99,
    })
    expect(s.hardStop).toBe(false)
    expect(s.failCount).toBe(0)
    expect(s.nextConnectAt).toBe(0)
  })

  it('401 from gateway/bot hard-stops', () => {
    const s = applyHttpAuthFailure(emptyGatewaySession(), 1_000, 401)
    expect(s.hardStop).toBe(true)
    expect(s.lastError).toBe('gateway_bot_http_401')
  })
})

describe('hydrateGatewaySession', () => {
  it('fills defaults for partial storage', () => {
    const s = hydrateGatewaySession({ sessionId: 'x', seq: 2 })
    expect(s.sessionId).toBe('x')
    expect(s.seq).toBe(2)
    expect(s.hardStop).toBe(false)
    expect(s.heartbeatMs).toBe(41_250)
  })
})
