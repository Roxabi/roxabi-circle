import { describe, expect, it } from 'vitest'
import { LYRA_DISCORD_USER_ID } from '../src/discord/lyra-mention'
import {
  isGatewayMessageInThread,
  loadLyraThreadActive,
  lyraPostedThreadId,
  lyraThreadActiveKey,
  prepareLyraThreadForward,
  rememberLyraThreadActive,
} from '../src/discord/lyra-thread-active'

function memoryStorage(init: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(init))
  return {
    get: async <T>(key: string) => store.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      store.set(key, value)
    },
  }
}

describe('lyra thread participation', () => {
  it('keys the participation set per thread channel id', () => {
    expect(lyraThreadActiveKey('thread-1')).toBe('lyra_thread_v1:thread-1')
  })

  it('treats position as the in-thread hint', () => {
    expect(isGatewayMessageInThread({ position: 0 })).toBe(true)
    expect(isGatewayMessageInThread({})).toBe(false)
  })

  it('marks Lyra in-thread posts by channel_id', () => {
    expect(
      lyraPostedThreadId(
        {
          channel_id: 'thread-1',
          author: { id: LYRA_DISCORD_USER_ID },
          position: 1,
        },
        LYRA_DISCORD_USER_ID,
      ),
    ).toBe('thread-1')
  })

  it('marks a Lyra starter message via thread.id', () => {
    expect(
      lyraPostedThreadId(
        {
          channel_id: 'parent-1',
          author: { id: LYRA_DISCORD_USER_ID },
          thread: { id: 'thread-9' },
        },
        LYRA_DISCORD_USER_ID,
      ),
    ).toBe('thread-9')
  })

  it('does not mark other authors', () => {
    expect(
      lyraPostedThreadId(
        { channel_id: 'thread-1', author: { id: 'human' }, position: 1 },
        LYRA_DISCORD_USER_ID,
      ),
    ).toBeNull()
  })

  it('round-trips the participation flag and swallows storage errors', async () => {
    const storage = memoryStorage()
    await rememberLyraThreadActive(storage, 'thread-1')
    expect(await loadLyraThreadActive(storage, 'thread-1')).toBe(true)
    expect(await loadLyraThreadActive(storage, 'thread-2')).toBe(false)
    await expect(
      rememberLyraThreadActive(
        {
          get: async () => undefined,
          put: async () => {
            throw new Error('put')
          },
        },
        'thread-1',
      ),
    ).resolves.toBeUndefined()
    await expect(
      loadLyraThreadActive(
        {
          get: async () => {
            throw new Error('get')
          },
          put: async () => {},
        },
        'thread-1',
      ),
    ).resolves.toBe(false)
  })

  it('skips forwarding when Lyra posts and records the thread', async () => {
    const storage = memoryStorage()
    const prepared = await prepareLyraThreadForward({
      msg: {
        id: 'm1',
        channel_id: 'thread-1',
        guild_id: 'g1',
        author: { id: LYRA_DISCORD_USER_ID, bot: true },
        position: 1,
      },
      lyraUserId: LYRA_DISCORD_USER_ID,
      configuredGuildId: 'g1',
      storage,
    })
    expect(prepared).toEqual({ skip: true })
    expect(await storage.get('lyra_thread_v1:thread-1')).toBe(true)
  })

  it('does not mark Lyra posts in another guild', async () => {
    const storage = memoryStorage()
    await prepareLyraThreadForward({
      msg: {
        id: 'm1',
        channel_id: 'thread-1',
        guild_id: 'other',
        author: { id: LYRA_DISCORD_USER_ID, bot: true },
        position: 1,
      },
      lyraUserId: LYRA_DISCORD_USER_ID,
      configuredGuildId: 'g1',
      storage,
    })
    expect(await storage.get('lyra_thread_v1:thread-1')).toBeUndefined()
  })

  it('reports threadActive for a later human message', async () => {
    const storage = memoryStorage({ 'lyra_thread_v1:thread-1': true })
    const prepared = await prepareLyraThreadForward({
      msg: {
        id: 'm2',
        channel_id: 'thread-1',
        guild_id: 'g1',
        author: { id: 'u1', bot: false },
        position: 2,
      },
      lyraUserId: LYRA_DISCORD_USER_ID,
      configuredGuildId: 'g1',
      storage,
    })
    expect(prepared).toEqual({ skip: false, threadActive: true })
  })
})
