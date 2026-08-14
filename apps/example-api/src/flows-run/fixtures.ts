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
