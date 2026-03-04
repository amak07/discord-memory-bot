import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { parseCustomId } from "../utils/custom-ids.js";
import { getNote, listNotesInNotebook, getNotebook } from "../services/db.js";
import { createNoteDetailEmbed, createErrorEmbed, COLORS } from "../utils/embeds.js";

/**
 * Handle "View Note" and "Browse Notebook" buttons from recall results.
 * Dispatched from handler.ts when action === "rsrc".
 */
export async function handleRecallSourceInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  const { subaction, data } = parseCustomId(interaction.customId);

  switch (subaction) {
    case "note":
      await handleViewNote(interaction as ButtonInteraction, data[0]);
      break;
    case "nb":
      await handleBrowseNotebook(interaction as ButtonInteraction, data[0]);
      break;
    default:
      await interaction.reply({ content: "Unknown source action.", ephemeral: true });
  }
}

/** Show full detail for a single note. */
async function handleViewNote(
  interaction: ButtonInteraction,
  noteIdStr: string
): Promise<void> {
  const noteId = parseInt(noteIdStr, 10);

  if (isNaN(noteId)) {
    await interaction.reply({
      embeds: [createErrorEmbed("Invalid note ID.")],
      ephemeral: true,
    });
    return;
  }

  try {
    const note = await getNote(noteId);

    if (!note) {
      await interaction.reply({
        embeds: [createErrorEmbed("Note not found. It may have been deleted.")],
        ephemeral: true,
      });
      return;
    }

    // Parse tags from JSON string
    let tags: string[] = [];
    try {
      if (note.tags) {
        tags = JSON.parse(note.tags);
      }
    } catch {
      // Skip malformed tags
    }

    // Try to get notebook name
    let notebookName = "Unknown";
    if (note.notebook_id && note.scope_type && note.scope_id) {
      const notebook = await getNotebook(note.notebook_id, {
        scopeType: note.scope_type as "server" | "dm",
        scopeId: note.scope_id,
      });
      if (notebook) {
        notebookName = notebook.name;
      }
    }

    const embed = createNoteDetailEmbed({
      topic: note.topic,
      summary: note.summary,
      notebookName,
      tags,
      createdBy: note.created_by_name,
      createdAt: new Date(note.created_at).toLocaleDateString(),
    });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error("View note error:", error);
    await interaction.reply({
      embeds: [createErrorEmbed("Something went wrong while fetching the note.")],
      ephemeral: true,
    });
  }
}

/** Show a list of notes in a notebook. */
async function handleBrowseNotebook(
  interaction: ButtonInteraction,
  notebookIdStr: string
): Promise<void> {
  const notebookId = parseInt(notebookIdStr, 10);

  if (isNaN(notebookId)) {
    await interaction.reply({
      embeds: [createErrorEmbed("Invalid notebook ID.")],
      ephemeral: true,
    });
    return;
  }

  try {
    const { notes, total } = await listNotesInNotebook(notebookId, 10, 0);

    if (notes.length === 0) {
      await interaction.reply({
        embeds: [createErrorEmbed("This notebook is empty.")],
        ephemeral: true,
      });
      return;
    }

    const noteLines = notes.map((n, i) => {
      const preview = n.summary.length > 80 ? n.summary.slice(0, 77) + "..." : n.summary;
      const date = new Date(n.created_at).toLocaleDateString();
      return `**${i + 1}. ${n.topic}** (${date})\n${preview}`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.browse)
      .setTitle("Notebook Notes")
      .setDescription(noteLines.join("\n\n"))
      .setFooter({ text: `Showing ${notes.length} of ${total} note${total === 1 ? "" : "s"}` });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error("Browse notebook error:", error);
    await interaction.reply({
      embeds: [createErrorEmbed("Something went wrong while browsing the notebook.")],
      ephemeral: true,
    });
  }
}
