/**
 * Mount point of the Better Auth handler, and the prefix of the kit throttle's path lists.
 * `createBetterAuth` passes it as `basePath` and refuses a `baseURL` whose path is neither `/`
 * nor this one: Better Auth routes on the `baseURL` path whenever there is one.
 */
export const BA_BASE_PATH = '/api/auth'
