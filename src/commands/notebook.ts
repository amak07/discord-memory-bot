import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import {
  getOrCreateNotebook,
  listNotebooks,
  getNotebookByName,
  archiveNotebook,
} from "../services/db.js";
import { resolveScope } from "../utils/scope.js";
import { encodeCustomId } from "../utils/custom-ids.js";
import { createNotebookListEmbed, createErrorEmbed, COLORS } from "../utils/embeds.js";
import type { Scope } from "../types.js";

export async function handleNotebook(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const scope = resolveScope(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    switch (subcommand) {
      case "create":
        await handleCreate(interaction, scope);
        break;
      case "list":
        await handleList(interaction, scope);
        break;
      case "archive":
        await handleArchive(interaction, scope);
        break;
      case "delete":
        await handleDelete(interaction, scope);
        break;
    }
  } catch (error) {
    console.error("Notebook command error:", error);
    await interaction.editReply({ embeds: [createErrorEmbed("Something went wrong.")] });
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  scope: Scope
): Promise<void> {
  const name = interaction.options.getString("name", true);

  // Check if it already exists
  const existing = await getNotebookByName(scope, name);
  if (existing) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setDescription(`Notebook "**${name}**" already exists.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  await getOrCreateNotebook(scope, name, interaction.user.id, interaction.user.username);

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("Notebook Created")
    .setDescription(`**${name}**`);
  await interaction.editReply({ embeds: [embed] });
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  scope: Scope
): Promise<void> {
  const notebooks = await listNotebooks(scope);

  if (notebooks.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.browse)
      .setTitle("Your Notebooks")
      .setDescription("No notebooks yet. Use `/save <topic>` to create your first.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const scopeLabel = scope.scopeType === "server" ? "Server" : "DM";
  const embed = createNotebookListEmbed({
    notebooks: notebooks.map(nb => ({
      name: nb.name,
      noteCount: nb.note_count,
      createdAt: nb.created_at,
    })),
    scopeLabel,
  });
  await interaction.editReply({ embeds: [embed] });
}

async function handleArchive(
  interaction: ChatInputCommandInteraction,
  scope: Scope
): Promise<void> {
  const name = interaction.options.getString("name", true);

  const notebook = await getNotebookByName(scope, name);
  if (!notebook) {
    await interaction.editReply({
      embeds: [createErrorEmbed(`Notebook "${name}" not found.`)],
    });
    return;
  }

  if (notebook.archived_at) {
    await interaction.editReply({
      embeds: [createErrorEmbed(`Notebook "${name}" is already archived.`)],
    });
    return;
  }

  await archiveNotebook(notebook.id, scope);

  const embed = new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setDescription(`Notebook "**${name}**" archived. Notes preserved but hidden from browse/recall.`);
  await interaction.editReply({ embeds: [embed] });
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  scope: Scope
): Promise<void> {
  const name = interaction.options.getString("name", true);

  const notebook = await getNotebookByName(scope, name);
  if (!notebook) {
    await interaction.editReply({
      embeds: [createErrorEmbed(`Notebook "${name}" not found.`)],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle("Confirm Delete")
    .setDescription(
      `Delete "**${name}**" and all its notes? This cannot be undone.`
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId("nb", "delyes", String(notebook.id)))
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(encodeCustomId("nb", "delno", String(notebook.id)))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}
