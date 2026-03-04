/**
 * CustomId encoding/decoding for Discord component interactions.
 * Format: {action}:{subaction}:{data...}
 *
 * Used in buttons and select menus to identify what interaction was triggered
 * and pass along any associated data.
 */

/**
 * Encode parts into a colon-separated customId string.
 * @param action - Primary action identifier (e.g. "notebook", "note")
 * @param subaction - Sub-action (e.g. "select", "delete", "confirm")
 * @param data - Variable-length additional data segments
 */
export function encodeCustomId(action: string, subaction: string, ...data: string[]): string {
  return [action, subaction, ...data].join(':');
}

/**
 * Parse a colon-separated customId string back into its parts.
 * @param customId - The raw customId from a Discord component interaction
 * @returns Parsed action, subaction, and remaining data segments
 */
export function parseCustomId(customId: string): { action: string; subaction: string; data: string[] } {
  const [action, subaction, ...data] = customId.split(':');
  return { action: action ?? '', subaction: subaction ?? '', data };
}
