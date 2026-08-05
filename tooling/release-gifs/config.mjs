/**
 * Shared config helpers for release GIF tooling.
 */

/**
 * @typedef {object} ReleaseGifCookie
 * @property {string} name
 * @property {string} value
 */

/**
 * @typedef {object} ReleaseGifConfig
 * @property {string} baseURL
 * @property {string} outDir
 * @property {string} statePath
 * @property {string} email
 * @property {string} password
 * @property {string} [postLoginPath]
 * @property {ReleaseGifCookie[]} [extraCookies]
 * @property {string[]} [forbiddenHostSubstrings]
 * @property {{ width: number, height: number }} [viewport]
 * @property {string} [locale]
 */

/**
 * @param {string} baseURL
 * @param {string[]} [forbidden]
 */
export function assertNotForbiddenHost(baseURL, forbidden = []) {
  const defaults = ['example.com']
  const list = [...defaults, ...forbidden]
  let host = ''
  try {
    host = new URL(baseURL).hostname
  } catch {
    throw new Error(`Invalid baseURL: ${baseURL}`)
  }
  // Allow localhost / 127.0.0.1 / staging explicitly
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    host.includes('staging')
  ) {
    return
  }
  for (const frag of list) {
    if (frag && host.includes(frag) && !host.includes('staging')) {
      // Only block production-looking kit hosts without staging
      if (frag === 'example.com' && !host.includes('staging')) {
        throw new Error(
          `Refusing production-like host "${host}". Use local/staging only (baseURL=${baseURL}).`,
        )
      }
      if (frag !== 'example.com' && host.includes(frag)) {
        throw new Error(`Refusing forbidden host "${host}" (matched ${frag}).`)
      }
    }
  }
}

/**
 * @param {string} base
 */
export function cookieUrlFromBase(base) {
  const u = new URL(base)
  return `${u.protocol}//${u.host}`
}

/**
 * @param {Partial<ReleaseGifConfig> & Pick<ReleaseGifConfig, 'baseURL'|'outDir'|'statePath'|'email'|'password'>} partial
 * @returns {ReleaseGifConfig}
 */
export function normalizeConfig(partial) {
  const cfg = {
    postLoginPath: '/',
    extraCookies: [],
    forbiddenHostSubstrings: [],
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
    ...partial,
  }
  assertNotForbiddenHost(cfg.baseURL, cfg.forbiddenHostSubstrings)
  return cfg
}
