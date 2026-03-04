import { EmbedBuilder } from 'discord.js';

/** Consistent color palette for all bot embeds. */
export const COLORS = {
  success: 0x57f287,   // Green  -- save confirmations
  info: 0x5865f2,      // Blue   -- recall answers
  browse: 0xfee75c,    // Yellow -- browse/list views
  error: 0xed4245,     // Red    -- errors
  neutral: 0x99aab5,   // Gray   -- neutral/cancel
} as const;

/** Create a save-confirmation embed (green). */
export function createSaveEmbed(opts: {
  topic: string;
  summary: string;
  notebookName: string;
  tags: string[];
  userName: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`Save to: ${opts.notebookName}?`)
    .setDescription(opts.summary)
    .setFooter({ text: `Requested by ${opts.userName}` });

  if (opts.tags.length > 0) {
    embed.addFields({ name: 'Tags', value: opts.tags.map(t => `\`${t}\``).join(' '), inline: true });
  }

  embed.addFields({ name: 'Topic', value: opts.topic, inline: true });

  return embed;
}

/** Create a recall-answer embed (blue). */
export function createRecallEmbed(opts: {
  answer: string;
  query: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('Memory Recall')
    .setDescription(opts.answer)
    .setFooter({ text: `Query: ${opts.query}` });
}

/** Create a note-detail embed (blue). */
export function createNoteDetailEmbed(opts: {
  topic: string;
  summary: string;
  notebookName: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(opts.topic)
    .setDescription(opts.summary)
    .addFields(
      { name: 'Notebook', value: opts.notebookName, inline: true },
      { name: 'Author', value: opts.createdBy, inline: true },
      { name: 'Created', value: opts.createdAt, inline: true },
    );

  if (opts.tags.length > 0) {
    embed.addFields({ name: 'Tags', value: opts.tags.map(t => `\`${t}\``).join(' ') });
  }

  return embed;
}

/** Create a notebook-list embed (yellow). */
export function createNotebookListEmbed(opts: {
  notebooks: Array<{ name: string; noteCount: number; createdAt: string }>;
  scopeLabel: string;
}): EmbedBuilder {
  const lines = opts.notebooks.map(
    nb => `**${nb.name}** -- ${nb.noteCount} note${nb.noteCount === 1 ? '' : 's'} (created ${nb.createdAt})`
  );

  return new EmbedBuilder()
    .setColor(COLORS.browse)
    .setTitle('Your Notebooks')
    .setDescription(lines.length > 0 ? lines.join('\n') : 'No notebooks yet.')
    .setFooter({ text: `Scope: ${opts.scopeLabel}` });
}

/** Create an error embed (red). */
export function createErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle('Error')
    .setDescription(message);
}
