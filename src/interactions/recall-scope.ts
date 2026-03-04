import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { parseCustomId, encodeCustomId } from "../utils/custom-ids.js";
import { searchNotes } from "../services/db.js";
import { answerFromNotes, type NoteWithContext } from "../services/ai.js";
import { createRecallEmbed, createErrorEmbed } from "../utils/embeds.js";

export interface PendingRecall {
  query: string;
  queryEmbedding: number[];
  scopeType: "server" | "dm";
  scopeId: string;
  userId: string;
  expiresAt: number;
}

export const pendingRecalls = new Map<string, PendingRecall>();

/** Remove expired entries (called lazily on each interaction). */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, value] of pendingRecalls) {
    if (value.expiresAt < now) pendingRecalls.delete(key);
  }
}

/**
 * Handle notebook scope selection for recall.
 * Dispatched from handler.ts when action === "recall".
 */
export async function handleRecallInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  cleanExpired();

  const { data } = parseCustomId(interaction.customId);

  // For buttons: customId = recall:scope:recallId:notebookChoice
  // For select menus: customId = recall:scope:recallId (value is in interaction.values[0])
  const recallId = data[0];
  const pending = pendingRecalls.get(recallId);

  if (!pending) {
    await interaction.update({
      embeds: [createErrorEmbed("This recall session has expired. Please run /recall again.")],
      components: [],
    });
    return;
  }

  // Verify the user clicking is the one who initiated
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({ content: "This isn't your recall session.", ephemeral: true });
    return;
  }

  // Determine notebook choice
  let notebookChoice: string;
  if (interaction.isButton()) {
    notebookChoice = data[1]; // "all" or a notebook ID
  } else {
    notebookChoice = interaction.values[0]; // from select menu
  }

  // Acknowledge: update message to show "Searching..."
  await interaction.update({
    content: `Searching for: "${pending.query}"...`,
    components: [],
  });

  try {
    const scope = { scopeType: pending.scopeType, scopeId: pending.scopeId } as const;
    const serverId = pending.scopeType === "server" ? pending.scopeId : "";
    const notebookId = notebookChoice === "all" ? undefined : parseInt(notebookChoice, 10);

    const notes = await searchNotes(serverId, pending.queryEmbedding, notebookId, scope);

    if (notes.length === 0) {
      await interaction.editReply({
        content: null,
        embeds: [createErrorEmbed("No matching notes found. Try a different query or search in All Notebooks.")],
        components: [],
      });
      pendingRecalls.delete(recallId);
      return;
    }

    // Map to NoteWithContext for answerFromNotes
    const notesWithContext: NoteWithContext[] = notes.map((n) => ({
      topic: n.topic,
      summary: n.summary,
      created_at: n.created_at,
      notebookName: n.notebook_name,
    }));

    const answer = await answerFromNotes(pending.query, notesWithContext);

    // Build answer embed
    const embed = createRecallEmbed({ answer, query: pending.query });

    // Build source buttons (max 5 source notes)
    const sourceButtons = notes.slice(0, 5).map((n) =>
      new ButtonBuilder()
        .setCustomId(encodeCustomId("rsrc", "note", String(n.id)))
        .setLabel(truncateLabel(`View: ${n.topic}`))
        .setStyle(ButtonStyle.Secondary)
    );

    // Optionally add "Browse Notebook" button if searching a specific notebook
    if (notebookId !== undefined && notes.length > 0) {
      sourceButtons.push(
        new ButtonBuilder()
          .setCustomId(encodeCustomId("rsrc", "nb", String(notebookId)))
          .setLabel("Browse Notebook")
          .setStyle(ButtonStyle.Primary)
      );
    }

    // Split into rows of 5
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < sourceButtons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(sourceButtons.slice(i, i + 5)));
    }

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: rows,
    });

    // Clean up pending recall
    pendingRecalls.delete(recallId);
  } catch (error) {
    console.error("Recall scope handler error:", error);
    await interaction.editReply({
      content: null,
      embeds: [createErrorEmbed("Something went wrong while searching. Please try again.")],
      components: [],
    });
    pendingRecalls.delete(recallId);
  }
}

/** Truncate a button label to fit Discord's 80-char limit. */
function truncateLabel(label: string): string {
  if (label.length <= 80) return label;
  return label.slice(0, 77) + "...";
}
