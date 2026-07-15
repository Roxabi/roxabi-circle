import { describe, expect, it } from 'vitest'
import { buildClientFormData, parseFeedbackFormData } from './form'

describe('parseFeedbackFormData', () => {
  it('rejects empty title', () => {
    const fd = new FormData()
    fd.append('title', '  ')
    expect(parseFeedbackFormData(fd)).toEqual({ error: 'Titre requis.' })
  })

  it('parses defaults and fields', () => {
    const fd = new FormData()
    fd.append('title', 'Bouton cassé')
    fd.append('body', 'Détail')
    fd.append('page', '/foo')
    fd.append('agent', 'TestAgent')
    const r = parseFeedbackFormData(fd)
    expect(r).toMatchObject({
      title: 'Bouton cassé',
      body: 'Détail',
      type: 'bug',
      priority: 'p2',
      page: '/foo',
      agent: 'TestAgent',
      files: [],
    })
  })

  it('normalizes invalid type/priority', () => {
    const fd = new FormData()
    fd.append('title', 'x')
    fd.append('type', 'nope')
    fd.append('priority', 'p9')
    const r = parseFeedbackFormData(fd)
    expect(r).toMatchObject({ type: 'bug', priority: 'p2' })
  })
})

describe('buildClientFormData', () => {
  it('round-trips core fields', () => {
    const fd = buildClientFormData({
      type: 'feature',
      priority: 'p1',
      title: 'Idea',
      body: 'Body',
      page: '/p',
      agent: 'ua',
    })
    const r = parseFeedbackFormData(fd)
    expect(r).toMatchObject({
      type: 'feature',
      priority: 'p1',
      title: 'Idea',
      body: 'Body',
      page: '/p',
      agent: 'ua',
    })
  })
})
