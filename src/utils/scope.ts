import type { Scope } from '../types.js';

/**
 * Resolve the scope of a Discord interaction.
 *
 * Uses a loose type for the interaction parameter so it works with
 * ChatInputCommandInteraction, ButtonInteraction, StringSelectMenuInteraction,
 * etc. without importing all of discord.js.
 *
 * @param interaction - Any Discord interaction with guildId and user.id
 * @returns Scope indicating whether this is a server or DM context
 */
export function resolveScope(interaction: { guildId: string | null; user: { id: string } }): Scope {
  if (interaction.guildId) {
    return { scopeType: 'server', scopeId: interaction.guildId };
  }
  return { scopeType: 'dm', scopeId: interaction.user.id };
}
