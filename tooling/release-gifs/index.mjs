/** Barrel for kit/product release-GIF engine (Node scripts only — not SPA). */
export { runAuthSetup } from './auth-setup.mjs'
export {
  assertNotForbiddenHost,
  cookieUrlFromBase,
  normalizeConfig,
} from './config.mjs'
export { CURSOR_INIT_SCRIPT } from './cursor-init.mjs'
export { hasBinary, probeDuration, webmToGif } from './ffmpeg-gif.mjs'
export {
  ensureAuthState,
  ensureCursor,
  moveClick,
  recordClip,
  resolveToolingReleaseGifsDir,
} from './record-core.mjs'
