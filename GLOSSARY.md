# Kit

Language shared by the reusable capability system in this repository. Not a product-domain glossary.

This glossary governs prose. It renames nothing. Kit terms are not translated: French prose keeps them verbatim.

## Language

**Kit**:
The reusable capability system that Products compose.
_Avoid_: Chemin A kit, boilerplate

**Product**:
Separately owned software that composes Kit capabilities with its own business domain.

**Product glossary**:
The vocabulary of one Product's business domain. It lives in the Product repository, never appended to this Kit-owned file. A Product glossary adds domain nouns and never redefines or translates a Kit term.

## Composition

**Package**:
A Kit-owned capability, published as `@kit/<name>`. A Package never depends on an App, and Product domain never enters one.
_Avoid_: library, lib, module, service

**App**:
A deployable that composes Packages — a Worker, a single-page app, or an MCP server. A Product's own deployables are Apps too.
_Avoid_: GitHub App, npm package, service, project, site

**Example App**:
A Kit-owned App whose only purpose is to exercise Packages against real interfaces. It is synthetic, never a starting copy for a Product, and never evidence that a Product has adopted the Kit.
_Avoid_: Proof App, template, starter, clone source

## Tenancy

**Deployment**:
One running instance of a Product, owning its own data and secrets. It bounds which Organizations can exist: the same real-world company reached through two Deployments is two unrelated Organizations, and the Kit promises nothing that spans them.
_Avoid_: Platform, environment, instance, tenant

**Organization**:
The boundary that isolates data and authority. Users, API keys, agents and runs act inside one Organization. A single-person customer is an Organization with one member.
_Avoid_: Tenant, account, workspace, company, client

**Module**:
A governed capability an Organization can be granted. It is usable only when three conditions hold together: the Module is available across the Deployment, the Organization has enabled it, and the acting member's Organization Role carries a Role–module grant for the operation. An unavailable or disabled Module reads as not found; a member without the grant is forbidden.
_Avoid_: Package, TypeScript module, feature flag, schema-sync set

## Authority

_Grants set the ceiling, permits narrow it, the registry filters it, the Runner View freezes the result._

**Platform Role**:
A role held across every Organization in one Deployment. A Platform Role is not Organization access: staff still need a membership to reach an Organization's data, cross-Organization reading is an audited per-route opt-in, and writing is break-glass only.
_Avoid_: role (unqualified), Organization Role, System

**Organization Role**:
A role held inside one Organization, and the thing that carries Role–module grants. Some Organization Roles are system-defined and immutable; others are defined per Organization.
_Avoid_: role (unqualified), Platform Role, user type

**Impersonation**:
A delegation that lets an explicitly authorized operator use another User's rights inside one shared Organization, while remaining accountable as the real actor. It never combines the operator's privileges with the represented User's rights.
_Avoid_: shared login, silent identity substitution

**Role–module grant**:
The access one Organization Role has on one Module. It is live policy: changing it affects the next request, never a run already under way.
_Avoid_: grant (unqualified), Capability Grant

**Capability Grant**:
The maximum authority a run may ever hold, minted server-side from the acting Organization's Module policy. Its tool allowance comes from the server-owned tool registry rather than from the Role–module grant, and it is never built from a plan, a client, or an agent's description of itself: sealing a run requires the allowance the minting produced, so an allowance assembled anywhere else is refused rather than checked. Starting a run requires its own authorization in addition to Module access.
_Avoid_: grant (unqualified), Role–module grant, permissions

**Tool grant class**:
The declared class a server-owned tool registry attaches to each tool, and the thing that decides whether the tool can enter a Capability Grant at all: a mintable tool may, and a tool declared never-mintable may not. Minting selects on it and checking re-verifies it against the registry the run is pinned to. The class is a decision, never derived from what the tool does: a tool nobody may reach without further policy is never-mintable however harmless it looks, and a registry that leaves the class undeclared is refused. Checking a class cannot answer every authority question — whether a run may infer at all comes from Module policy, not from any registry — which is why sealing asks for the minting itself, not for a grant that merely looks conformant. The descriptive effect hint an agent-facing tool surface carries is a different thing and holds no authority.
_Avoid_: effect, tool effect, read-only flag, read class

**Effective Authority**:
What a run may actually do: the Capability Grant narrowed by the plan's permits and by the tool registry. Narrowing only — a plan can never widen its Capability Grant.
_Avoid_: effective permissions, resolved grant

**Runner View**:
The sealed record a run executes from, fixed when the run is created. It never holds the Capability Grant's full allowance; that allowance is kept apart for audit, never stored on the view and never consulted to dispatch work.
_Avoid_: snapshot (unqualified), live plan

## Notifications

**Notification type**:
The declared kind of a Notification, named by a stable key such as `tasks.assigned` and grouped under one category that a Notification rule can target as a whole. Apps declare their types in code.
_Avoid_: event, template, kind

**Notification producer**:
The server-side App code that notifies chosen Users about one source resource, each of whom can see it, and marks those Notifications resolved once the action is done.
_Avoid_: producer (unqualified), sender, emitter

**Notification**:
What one User is told about one source resource, inside the Organization that owns that resource. It is read once its User has seen it, and resolved once the action it asks for is done, by anyone.
_Avoid_: message, alert, toast; done, archived, dismissed (for resolved)

**Notification rule**:
One level's on or off choice — Deployment, Organization or User — for a Notification type, a category or every type, on one Channel. A locked rule binds every lower level; a User never locks.
_Avoid_: preference, setting, policy, override, force

**Channel**:
A way to reach a User or an Organization destination: in-app (the Inbox), email, Slack, or one an App adds.
_Avoid_: transport, medium, channel (unqualified) for a Slack channel

**Organization destination**:
A place on a Channel that an Organization configures to be reached as a whole, such as a team Slack channel. It is not a User and has no Inbox.
_Avoid_: team channel, Organization channel

**Delivery**:
The hand-off to one User or one Organization destination on one Channel, tracked until it is sent, failed or skipped. A User's Delivery carries their Notification; one Delivery may take several attempts.
_Avoid_: send, dispatch, attempt

**Inbox**:
Where one User reads their Notifications in one Organization. Every Notification appears there; no Notification rule can turn it off.
_Avoid_: feed, notification center

**Mandatory Channel**:
A Channel that one Notification type declares in code as impossible to turn off by any Notification rule, kept for notices whose loss could harm the User or the Organization. It never bypasses access: a User who may not see the Notification gets nothing.
_Avoid_: required, forced, critical, locked

**Slack installation**:
The connection between one Organization and one Slack workspace, made by an Organization admin through OAuth, which holds the bot token and the Organization destinations on that workspace.
_Avoid_: Slack integration, workspace (for the connection)

## Execution

**Durable execution**:
A unit of work whose progress must survive a crash or an eviction, such as a plan run, a conversation or a job message. [ADR-0018](docs/kit/architecture/adr/0018-durable-execution-ownership.md) D3 decides what is one execution and how distinct executions compose.
_Avoid_: workflow (unqualified), job (unqualified)

**Durable owner**:
The one general-purpose runtime that persists a durable execution's progress and resumes it after an interruption. [ADR-0018](docs/kit/architecture/adr/0018-durable-execution-ownership.md) D2 holds the criterion and its boundary with the Kit or Product code that composes on the owner.
_Avoid_: native harness, engine, scheduler
