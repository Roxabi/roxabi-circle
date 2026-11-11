/**
 * Kit organization plugin (ADR-0003 four system roles).
 * Schema + AC only — kit owns create/memberships (seed + POST /api/orgs).
 */
import { createAccessControl } from 'better-auth/plugins/access'
import { organization } from 'better-auth/plugins/organization'
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access'

const ac = createAccessControl(defaultStatements)
const readerAc = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ['read'],
})

export function createKitOrganizationPlugin() {
  return organization({
    ac,
    roles: {
      owner: ownerAc,
      admin: adminAc,
      member: memberAc,
      reader: readerAc,
    },
    allowUserToCreateOrganization: false,
    disableOrganizationDeletion: true,
    invitationLimit: 0,
    schema: {
      organization: {
        additionalFields: {
          kind: {
            type: 'string',
            required: true,
            defaultValue: 'client',
            input: false,
          },
          status: {
            type: 'string',
            required: true,
            defaultValue: 'active',
            input: false,
          },
        },
      },
    },
  })
}
