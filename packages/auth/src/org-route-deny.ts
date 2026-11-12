import { BA_BASE_PATH } from './better-auth-base-path'

const ORG_PREFIX = `${BA_BASE_PATH}/organization/`

/**
 * True for every path of Better Auth's organization plugin, `/api/auth/organization/*`
 * (ADR-0003 D10). A product denies them in front of the throttle and answers 404, spending
 * nothing: they skip the kit's role ceiling, its org-status check and its audit, and the kit
 * organization APIs replace them. A prefix, not a verb list, so a route that a Better Auth upgrade
 * adds is denied the day it ships. Case and repeated slashes are ignored: the deny may match more
 * paths than Better Auth routes, never fewer.
 */
export function isBaOrganizationRoute(pathname: string): boolean {
  return `${pathname.replace(/\/{2,}/g, '/').toLowerCase()}/`.startsWith(ORG_PREFIX)
}
