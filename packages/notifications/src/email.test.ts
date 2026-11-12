import { describe, expect, it } from 'vitest'
import { renderNotificationEmail } from './index'

const copy = { brand: 'Brand <&>', manageRulesLabel: 'Manage <rules> & alerts' }
const manageRulesHref = 'https://example.test/rules?a=1&b=2'
const syntheticUsername = copy.brand
const syntheticPassword = copy.manageRulesLabel
const credentialedFixtureUrl = new URL('https://example.test/')
credentialedFixtureUrl.username = syntheticUsername
credentialedFixtureUrl.password = syntheticPassword

describe('email layout', () => {
  it('retains subject and management link in both formats while escaping generated HTML', () => {
    const rendered = renderNotificationEmail({
      content: { subject: 'Subject', text: 'Hello <team> & "friends"' },
      manageRulesHref,
      copy,
    })
    expect(rendered.subject).toBe('Subject')
    expect(rendered.text).toContain(manageRulesHref)
    expect(rendered.html).toContain('Hello &lt;team&gt; &amp;')
    expect(rendered.html).toContain('Brand &lt;&amp;&gt;')
    expect(rendered.html).toContain('Manage &lt;rules&gt; &amp; alerts')
    expect(rendered.html).toContain('https://example.test/rules?a=1&amp;b=2')
    expect(rendered.html).not.toContain('<team>')
  })
  it('preserves trusted app HTML and still appends a management link', () => {
    const rendered = renderNotificationEmail({
      content: { subject: 'x', text: 'body', html: '<strong>Trusted</strong>' },
      manageRulesHref,
      copy,
    })
    expect(rendered.html).toContain('<strong>Trusted</strong>')
    expect(rendered.html).toContain('https://example.test/rules?a=1&amp;b=2')
    expect(rendered.text).toContain(manageRulesHref)
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '//evil.test/rules',
    credentialedFixtureUrl.href,
    'https://example.test/\nother',
    'https://example.test/\u007f',
  ])('rejects unsafe URL %j', (url) => {
    expect(() =>
      renderNotificationEmail({ content: { subject: 'x', text: 'x' }, manageRulesHref: url, copy }),
    ).toThrow()
  })
})
