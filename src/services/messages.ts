import type { TextChannel } from "discord.js";
import type { SavedMessage } from "../types.js";

export async function fetchRecentMessages(channel: TextChannel, limit = 50): Promise<SavedMessage[]> {
  const messages = await channel.messages.fetch({ limit });

  return messages
    .filter((msg) => !msg.author.bot)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => ({
      author: msg.author.displayName,
      content: msg.content,
      timestamp: msg.createdAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    }));
}
