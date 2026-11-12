import type { GatewayMessage } from './github-watch'
import { isGatewayMessageInThread } from './lyra-thread-active'

export function lyraMessageIgnoreReason(
  msg: GatewayMessage,
  lyraUserId: string,
  input: { threadActive?: boolean },
  mentionsLyraUser: (msg: GatewayMessage, lyraUserId: string) => boolean,
): string | null {
  if (msg.webhook_id) return 'webhook'
  if (msg.author?.bot) return 'bot'
  if (msg.author?.id === lyraUserId) return 'self'
  if (!mentionsLyraUser(msg, lyraUserId)) {
    if (!(input.threadActive && isGatewayMessageInThread(msg))) {
      return 'no_mention'
    }
  }
  return null
}
