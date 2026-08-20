export type AuthFormNotify = {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  message: (title: string, description?: string) => void
}

export const silentNotify: AuthFormNotify = {
  success: () => {},
  error: () => {},
  message: () => {},
}

/** App `apiFetch`-shaped POST helper. */
export type AuthFormFetch = (path: string, init?: RequestInit) => Promise<unknown>
