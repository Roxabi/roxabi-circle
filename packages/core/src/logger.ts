export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export type Logger = {
  child: (fields: LogFields) => Logger
  debug: (msg: string, fields?: LogFields) => void
  info: (msg: string, fields?: LogFields) => void
  warn: (msg: string, fields?: LogFields) => void
  error: (msg: string, fields?: LogFields) => void
}

function emit(level: LogLevel, msg: string, base: LogFields, fields?: LogFields): void {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...base,
    ...fields,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Structured JSON logger (one line per event). Use child({ requestId }) on request path. */
export function createLogger(base: LogFields = {}): Logger {
  return {
    child(fields) {
      return createLogger({ ...base, ...fields })
    },
    debug(msg, fields) {
      emit('debug', msg, base, fields)
    },
    info(msg, fields) {
      emit('info', msg, base, fields)
    },
    warn(msg, fields) {
      emit('warn', msg, base, fields)
    },
    error(msg, fields) {
      emit('error', msg, base, fields)
    },
  }
}
