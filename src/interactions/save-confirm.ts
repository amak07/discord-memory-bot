import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { parseCustomId, encodeCustomId } from "../utils/custom-ids.js";
import { getOrCreateNotebook, listNotebooks, saveNote } from "../services/db.js";
import { createSaveEmbed, createErrorEmbed, COLORS } from "../utils/embeds.js";

export interface PendingSave {
  topic: string;
  summary: string;
  tags: string[];
  notebookName: string;
  notebookId: number | null; // null = new notebook needs creation
  embedding: number[];
  rawMessages: string;
  scopeType: "server" | "dm";
  scopeId: string;
  userId: string;
  userName: string;
  channelId: string;
  expiresAt: number;
}

export const pendingSaves = new Map<string, PendingSave>();

/** Remove expired entries (called lazily on each interaction). */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, value] of pendingSaves) {
    if (value.expiresAt < now) pendingSaves.delete(key);
  }
}

/**
 * Central handler for all save-flow component interactions (buttons + select menus).
 * Dispatches to confirm/change/cancel/pick based on the customId subaction.
 */
export async function handleSaveInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  cleanExpired();

  const { subaction, data } = parseCustomId(interaction.customId);
  const pendingId = data[0];
  const pending = pendingSaves.get(pendingId);

  if (!pending) {
    await interaction.update({
      embeds: [createErrorEmbed("This save session has expired. Please run /save again.")],
      components: [],
    });
    return;
  }

  // Verify the user clicking is the one who initiated
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({ content: "This isn't your save session.", ephemeral: true });
    return;
  }

  switch (subaction) {
    case "confirm":
      await handleConfirm(interaction as ButtonInteraction, pendingId, pending);
      break;
    case "change":
      await handleChangeNotebook(interaction as ButtonInteraction, pendingId, pending);
      break;
    case "cancel":
      await handleCancel(interaction as ButtonInteraction, pendingId);
      break;
    case "pick":
      await handleNotebookPick(interaction as StringSelectMenuInteraction, pendingId, pending);
      break;
    default:
      await interaction.reply({ content: "Unknown action.", ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// Sub-handlers
// ---------------------------------------------------------------------------

/** Confirm: persist the note to the database and show a success embed. */
async function handleConfirm(
  interaction: ButtonInteraction,
  pendingId: string,
  pending: PendingSave
): Promise<void> {
  const scope = { scopeType: pending.scopeType, scopeId: pending.scopeId } as const;
  const notebook = await getOrCreateNotebook(
    scope, pending.notebookName, pending.userId, pending.userName
  );

  await saveNote({
    server_id: pending.scopeType === "server" ? pending.scopeId : "",
    channel_id: pending.channelId,
    topic: pending.topic,
    summary: pending.summary,
    raw_messages: pending.rawMessages,
    created_by_id: pending.userId,
    created_by_name: pending.userName,
    notebook_id: notebook.id,
    tags: JSON.stringify(pending.tags),
    scope_type: pending.scopeType,
    scope_id: pending.scopeId,
  }, pending.embedding);

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`Note Saved: "${pending.topic}"`)
    .setDescription(pending.summary)
    .addFields(
      { name: "Notebook", value: notebook.name, inline: true },
      { name: "Tags", value: pending.tags.length > 0 ? pending.tags.map(t => `\`${t}\``).join(" ") : "None", inline: true },
    )
    .setFooter({ text: `Saved by ${pending.userName}` })
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
  pendingSaves.delete(pendingId);
}

/** Change Notebook: show a select menu with existing notebooks + "Create New". */
async function handleChangeNotebook(
  interaction: ButtonInteraction,
  pendingId: string,
  pending: PendingSave
): Promise<void> {
  const scope = { scopeType: pending.scopeType, scopeId: pending.scopeId } as const;
  const notebooks = await listNotebooks(scope);

  const options = notebooks.map(nb => ({
    label: nb.name,
    description: `${nb.note_count} note${nb.note_count === 1 ? "" : "s"}`,
    value: `existing:${nb.id}:${nb.name}`,
  }));

  // Add "Create New" option
  options.push({
    label: "+ Create New Notebook",
    description: "Type a name in the save command",
    value: "new",
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encodeCustomId("save", "pick", pendingId))
    .setPlaceholder("Choose a notebook...")
    .addOptions(options.slice(0, 25)); // Discord max 25 options

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  // Keep a cancel button below the select menu
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId("save", "cancel", pendingId))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.update({
    embeds: [createSaveEmbed({
      topic: pending.topic,
      summary: pending.summary,
      notebookName: "Choose below...",
      tags: pending.tags,
      userName: pending.userName,
    })],
    components: [row, cancelRow],
  });
}

/** Notebook Pick: handle the select menu choice and return to confirm UI. */
async function handleNotebookPick(
  interaction: StringSelectMenuInteraction,
  pendingId: string,
  pending: PendingSave
): Promise<void> {
  const value = interaction.values[0];

  if (value === "new") {
    // For now, default to "General" — modal input can be added in a future task
    pending.notebookName = "General";
    pending.notebookId = null;
  } else if (value.startsWith("existing:")) {
    const parts = value.split(":");
    pending.notebookId = parseInt(parts[1], 10);
    pending.notebookName = parts.slice(2).join(":"); // handle names with colons
  }

  // Show confirm UI again with updated notebook
  const embed = createSaveEmbed({
    topic: pending.topic,
    summary: pending.summary,
    notebookName: pending.notebookName,
    tags: pending.tags,
    userName: pending.userName,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId("save", "confirm", pendingId))
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(encodeCustomId("save", "change", pendingId))
      .setLabel("Change Notebook")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encodeCustomId("save", "cancel", pendingId))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

/** Cancel: discard the pending save and show a neutral embed. */
async function handleCancel(
  interaction: ButtonInteraction,
  pendingId: string
): Promise<void> {
  pendingSaves.delete(pendingId);
  const embed = new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setTitle("Save Cancelled")
    .setDescription("No note was saved.");
  await interaction.update({ embeds: [embed], components: [] });
}
