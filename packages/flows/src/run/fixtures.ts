/** V1 invoke-only plan (echo_hello / echo). Not DEMO_ECHO_PLAN_YAML. */

export const INVOKE_ONLY_PLAN_YAML = `flows: v0
plan:
  id: echo-only
permits:
  tools:
    - echo
tasks:
  echo_hello:
    invoke:
      tool: echo
      args:
        text: hello-flows
`

/** Two independent invoke siblings — both ready in wave 0. */
export const TWO_SIBLING_INVOKE_PLAN_YAML = `flows: v0
plan:
  id: two-echo
permits:
  tools:
    - echo
tasks:
  echo_a:
    invoke:
      tool: echo
      args:
        text: alpha
  echo_b:
    invoke:
      tool: echo
      args:
        text: beta
`

/** Mixed read+write invoke tools — per-tool retry lookup (Roxabi/roxabi-boilerplate-cf#234). */
export const MIXED_EFFECT_INVOKE_PLAN_YAML = `flows: v0
plan:
  id: mixed-effects
permits:
  tools:
    - echo_read
    - echo_write
tasks:
  t_read:
    invoke:
      tool: echo_read
      args:
        text: r
  t_write:
    invoke:
      tool: echo_write
      args:
        text: w
`

/** echo_b.after is echo_a — a started echo_a is not a ready echo_b. */
export const CHAIN_INVOKE_PLAN_YAML = `flows: v0
plan:
  id: echo-chain
permits:
  tools:
    - echo
tasks:
  echo_a:
    invoke:
      tool: echo
  echo_b:
    after: [echo_a]
    invoke:
      tool: echo
`
