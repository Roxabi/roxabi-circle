/** Minimal Bun.serve types so the entry typechecks without @types/bun. */
declare const Bun: {
  serve(opts: { port: number; fetch: (request: Request) => Response | Promise<Response> }): {
    port: number
    stop: () => void
  }
}
