# `@roxabi/circle-voice-recorder`

Spike A process: join a Discord **voice** channel (custom `@discordjs/voice`
adapter) and dump per-speaker placeholders to disk / optional HTTP PUT (R2 later).

**Not production-armed.** Design + UDP go/no-go:
[`docs/product/design/voice-recording-spike-a.md`](../../docs/product/design/voice-recording-spike-a.md).

This process must **never** open `gateway.discord.gg` with the Lyra bot token.

```sh
bun run --filter @roxabi/circle-voice-recorder test
docker build -t circle-voice-recorder-spike-a .
```
