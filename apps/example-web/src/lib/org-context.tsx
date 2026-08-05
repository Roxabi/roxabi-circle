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

export function OrgProvider({ me, children }: { me: MeResponse | undefined; children: ReactNode }) {
  const orgs = me?.orgs ?? []
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => readStoredOrgId())

  const setActiveOrgId = useCallback((id: string | null) => {
    setActiveOrgIdState(id)
    writeStoredOrgId(id)
  }, [])

  // Keep selection valid when me.orgs changes
  useEffect(() => {
    if (orgs.length === 0) {
      if (activeOrgId != null) setActiveOrgId(null)
      return
    }
    if (activeOrgId && orgs.some((o) => o.id === activeOrgId)) return
    setActiveOrgId(orgs[0]!.id)
  }, [orgs, activeOrgId, setActiveOrgId])

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) ?? null,
    [orgs, activeOrgId],
  )

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
