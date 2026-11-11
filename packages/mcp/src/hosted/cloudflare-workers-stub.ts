/** Node-test stand-in for `cloudflare:workers`. OAuthProvider only instanceof-checks this. */
export class WorkerEntrypoint<Env = unknown, Props = unknown> {
  ctx: { props?: Props }
  env: Env

  constructor(ctx: { props?: Props }, env: Env) {
    this.ctx = ctx
    this.env = env
  }
}
