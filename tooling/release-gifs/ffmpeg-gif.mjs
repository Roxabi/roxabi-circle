/**
 * webm → share GIF (ffmpeg + ffprobe). System binaries required.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, rmSync } from 'node:fs'

/**
 * @param {string} cmd
 * @returns {boolean}
 */
export function hasBinary(cmd) {
  const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' })
  return r.status === 0
}

/**
 * @param {string} path
 * @returns {number|null}
 */
export function probeDuration(path) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' },
  )
  const d = Number.parseFloat((r.stdout || '').trim())
  return Number.isFinite(d) ? d : null
}

/**
 * @param {string} webmPath
 * @param {string} gifPath
 * @param {{
 *   speed?: number
 *   fps?: number
 *   trimStartS?: number
 *   trimEndS?: number
 * }} [opts]
 */
export function webmToGif(webmPath, gifPath, opts = {}) {
  if (!hasBinary('ffmpeg') || !hasBinary('ffprobe')) {
    throw new Error(
      'ffmpeg/ffprobe not found on PATH. Install ffmpeg (e.g. apt install ffmpeg / brew install ffmpeg).',
    )
  }

  const speed = Number(opts.speed ?? process.env.GIF_SPEED ?? '0.5')
  const fps = Number(opts.fps ?? process.env.GIF_FPS ?? '15')
  const trimStartS = Number(opts.trimStartS ?? process.env.GIF_TRIM_START_S ?? '1.2')
  const trimEndS = Number(opts.trimEndS ?? process.env.GIF_TRIM_END_S ?? '1.0')

  const palette = webmPath.replace(/\.webm$/, '.palette.png')
  const trimmed = webmPath.replace(/\.webm$/, '.trim.webm')
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 0.55
  const setpts = (1 / safeSpeed).toFixed(3)

  const duration = probeDuration(webmPath)
  const start = Number.isFinite(trimStartS) && trimStartS > 0 ? trimStartS : 0
  let take = null
  if (duration != null) {
    const endPad = Number.isFinite(trimEndS) && trimEndS > 0 ? trimEndS : 0
    take = Math.max(1.5, duration - start - endPad)
  }

  const trimArgs = ['-y']
  if (start > 0) trimArgs.push('-ss', String(start))
  trimArgs.push('-i', webmPath)
  if (take != null) trimArgs.push('-t', String(take))
  trimArgs.push('-an', '-c:v', 'libvpx', '-crf', '12', '-b:v', '2M', trimmed)

  const r0 = spawnSync('ffmpeg', trimArgs, { encoding: 'utf8' })
  if (r0.status !== 0) {
    console.warn('  ⚠ trim ffmpeg failed, fallback full webm:', (r0.stderr || '').slice(-300))
    copyFileSync(webmPath, trimmed)
  }

  const vfBase = `fps=${fps},setpts=${setpts}*PTS,scale=960:-1:flags=lanczos`
  const r1 = spawnSync(
    'ffmpeg',
    ['-y', '-i', trimmed, '-vf', `${vfBase},palettegen=stats_mode=diff`, palette],
    { encoding: 'utf8' },
  )
  if (r1.status !== 0) throw new Error(r1.stderr || 'palettegen failed')

  const r2 = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      trimmed,
      '-i',
      palette,
      '-lavfi',
      `${vfBase}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
      gifPath,
    ],
    { encoding: 'utf8' },
  )
  if (r2.status !== 0) throw new Error(r2.stderr || 'gif encode failed')

  for (const p of [palette, trimmed]) {
    try {
      rmSync(p)
    } catch {
      /* ignore */
    }
  }
}
