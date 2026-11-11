import type { Env } from './env'
import type { AppVariables } from './middleware/request-id'

export type AppEnv = { Bindings: Env; Variables: AppVariables }
