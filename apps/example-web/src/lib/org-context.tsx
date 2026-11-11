import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { MeOrg, MeResponse } from './auth'

const STORAGE_KEY = 'kit.activeOrgId'

type OrgContextValue = {
  orgs: MeOrg[]
  activeOrgId: string | null
  activeOrg: MeOrg | null
  setActiveOrgId: (id: string | null) => void
}

const OrgContext = createContext<OrgContextValue | null>(null)

function readStoredOrgId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredOrgId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Membership id only. A stored or caller id outside the list is never returned. */
function membershipOrgId(
  orgs: readonly { id: string }[],
  candidate: string | null | undefined,
): string | null {
  if (candidate && orgs.some((org) => org.id === candidate)) return candidate
  return orgs[0]?.id ?? null
}

export function OrgProvider({ me, children }: { me: MeResponse | undefined; children: ReactNode }) {
  const orgs = me?.orgs ?? []
  const [picked, setPicked] = useState<string | null>(() => readStoredOrgId())
  const activeOrgId = membershipOrgId(orgs, picked)
  const activeOrg = useMemo(
    () => orgs.find((org) => org.id === activeOrgId) ?? null,
    [orgs, activeOrgId],
  )

  const setActiveOrgId = useCallback((id: string | null) => {
    setPicked(id)
  }, [])

  useEffect(() => {
    writeStoredOrgId(activeOrgId)
    if (picked !== activeOrgId) setPicked(activeOrgId)
  }, [activeOrgId, picked])

  const value = useMemo(
    () => ({ orgs, activeOrgId, activeOrg, setActiveOrgId }),
    [orgs, activeOrgId, activeOrg, setActiveOrgId],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrgContext(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useOrgContext must be used within OrgProvider')
  }
  return ctx
}
