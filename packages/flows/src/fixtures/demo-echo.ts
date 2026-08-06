/** Golden dogfood plan YAML (exported for apps — no FS path into package src). */
export const DEMO_ECHO_PLAN_YAML = `# Generic dogfood plan — zero product domain strings (ADR-0005).
flows: v0
plan:
  id: demo-echo
  description: Echo text then single-shot infer summary (kit dogfood)
  max_tokens: 2000
permits:
  tools:
    - echo
tasks:
  echo_hello:
    invoke:
      tool: echo
      args:
        text: hello-flows
  summarize:
    after:
      - echo_hello
    infer:
      prompt: "Summarize the previous echo output in one short sentence."
      max_tokens: 128
`
