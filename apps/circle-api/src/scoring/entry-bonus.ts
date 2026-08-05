/**
 * Hidden entry PR bonus: one line of monorepo-only ASCII art in PR body.
 * Art lives packed under docs/product/.hidden/ — scorer only keeps line hashes.
 *
 * @see docs/product/.hidden/entry-bonus.md
 */

export const ENTRY_PR_BONUS_POINTS = 10

/** SHA-256 (hex) of each non-empty line of the hidden ASCII art (exact bytes). */
export const ENTRY_BONUS_LINE_SHA256: ReadonlySet<string> = new Set([
  '97e0812e01a80357dd4193293b2f05bcfb628904f95097c37cf9d84bece885ed',
  '2e40923580de601369787f3554dc07b359c5c029a31e6443a30c34316fae17dc',
  '199b05a4b172b77b067f654a9703bb201f11c0d7196d3ef8e7756ea14f00edcd',
  'a61a4303da75ae4fe7932049be6260cf3f1fa7987b5a437979437728ced6e867',
  '26f7373a8a5b4a7d4099a05f793a3e0a3d388f97a71079d4b66703543ffd9313',
  '32ea3f1135d1f48c91330dbddd5457b9eb0af1c0037ce0dd9c7ea1d78b4a0c11',
  'ef13d5eb82777315a80824c2517bbf47d608c8213e0618314dcd1fd8c6ea2ae4',
  'bb885b80c8cc34817028359466cd8039c01d944ece9a90d8eb09216b5db5e55a',
  '2af069b4921b1c217f6959dad3393fbbb43dcce76b7a8c6e6b98a797bd6220d1',
  '648deea442f7e4f3f0c7ecd6807213f83444856fcfdf928bf67a047e7f429d72',
  '969da7669ae2432205db05c8e55418894f7bbc49dd5f07ffb6a7ce4ae0eef574',
  '83c91695e678368a0a0f03accd3e5f049af1d4636aac97f58e01a323d88d519d',
  '5bd04a174b858c0f41b6f103e7a2d69b9714e3b13e6b59d6a47e2b17fd73424d',
  '772d3710364c4b580f8fe250e5e7d6f1b8266b31ae169460fee4f4572312f215',
  '15e5887197511791cb06465d02429ce14126a2b5919dccebfad8ce9f130a6935',
  'db31066c5fd223d7a90b06b0a4bd8226ad0ff0e0253bbf463df0bda16fb7c1fc',
  'ec0e7b4c01778180117ff21fe77ced250258d17fad32aae27c9f8d261865cb55',
  '81e8979f31edaee2fb3d0effd07ff5adc5c6d2cbaaf9b87299a6f18042153530',
  '3f1f39b763aa82fee3e133148611364b35f96f959fc82eee1fec96609c43fc0d',
  '6ef5b6cdd8034b55a78f3da9384554a6d95cb8003f36a103568a12d9680d5593',
  '92bcc2bada6228706b4cd7c182159c42ee4d6afb3e608cf75df9d922d13ec5cf',
  'ba6cc347c8cea19b28adfce82c3d9efe604989e304486e9f81eb615f07422c11',
  '2b5e88dec44c2ca574cfd8e5026bb3fe9f5c41da0e23a453a84aacccddbde72c',
  '25e20a663502be9fcfaf3a79759aa8099b7c3fa8852b67d04f9ce4ae8aa9b9e4',
  '5d1e799622e89b2d897b60a5f06f34c9d9e6e233da0734ec04c2eb8aca1ca60f',
  'b1fee079e57a1bac4b1fb151c7883b9474951512c0af437665bf69b06c823523',
  '94c0537d887436238a0accb60bdb4a0add9ad06fdcb40c770130a457751704f2',
])

/** Normalize PR body: CRLF→LF, strip trailing whitespace/newlines only. */
export function normalizePrBody(body: string | null | undefined): string {
  if (!body) return ''
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\n]+$/u, '')
}

/**
 * True when body is exactly one line of the hidden art (no multi-line, no empty).
 * Uses SHA-256 so the art itself is not stored in the scorer.
 */
export async function prBodyGrantsEntryBonus(body: string | null | undefined): Promise<boolean> {
  const core = normalizePrBody(body)
  if (!core || core.includes('\n')) return false
  const hex = await sha256Hex(core)
  return ENTRY_BONUS_LINE_SHA256.has(hex)
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
