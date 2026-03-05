type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogContext = Record<string, unknown>
type SupportedLogLevelOverride = 'DEBUG' | 'ERROR'

type Logger = {
  debug: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, context?: LogContext) => void
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const resolveLogLevelOverride = (): SupportedLogLevelOverride | null => {
  const rawLevel = (process.env.LOG_LEVEL ?? process.env.NEXT_PUBLIC_LOG_LEVEL ?? '').trim().toUpperCase()
  if (rawLevel === 'DEBUG' || rawLevel === 'ERROR') {
    return rawLevel
  }

  return null
}

const getMinLogLevel = (): number => {
  const levelOverride = resolveLogLevelOverride()
  if (levelOverride === 'ERROR') {
    return LOG_LEVELS.error
  }
  if (levelOverride === 'DEBUG') {
    return LOG_LEVELS.debug
  }

  const env = process.env.NODE_ENV ?? 'development'

  // Default behavior without LOG_LEVEL override.
  if (env === 'production') {
    return LOG_LEVELS.error
  }

  // Development: everything (DEBUG+)
  return LOG_LEVELS.debug
}

const minLevel = getMinLogLevel()

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= minLevel
}

const formatLog = (level: LogLevel, message: string, context?: LogContext) => {
  const timestamp = new Date().toISOString()

  // Structured JSON for production
  if (process.env.NODE_ENV === 'production') {
    return {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...context,
    }
  }

  // Human-readable for development
  return {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...(context && Object.keys(context).length > 0 ? context : {}),
  }
}

const log = (level: LogLevel, method: typeof console.log) => {
  return (message: string, context?: LogContext) => {
    if (!shouldLog(level)) return

    const formattedLog = formatLog(level, message, context)
    method(formattedLog)
  }
}

export const logger: Logger = {
  debug: log('debug', console.debug),
  info: log('info', console.info),
  warn: log('warn', console.warn),
  error: log('error', console.error),
}
