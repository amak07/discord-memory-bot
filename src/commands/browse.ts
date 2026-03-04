import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } from "discord.js";
import { listNotebooks, getNotebookByName, listNotesInNotebook } from "../services/db.js";
import { resolveScope } from "../utils/scope.js";
import { encodeCustomId } from "../utils/custom-ids.js";
import { createErrorEmbed } from "../utils/embeds.js";
import { buildBrowseEmbed, buildBrowseComponents } from "../interactions/browse-pagination.js";

const PAGE_SIZE = 5;

export async function handleBrowse(interaction: ChatInputCommandInteraction): Promise<void> {
  const notebookName = interaction.options.getString("notebook");
  const scope = resolveScope(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (notebookName) {
      // Go directly to notebook's notes
      const notebook = await getNotebookByName(scope, notebookName);
      if (!notebook) {
        await interaction.editReply({
          embeds: [createErrorEmbed(`Notebook "${notebookName}" not found.`)],
        });
        return;
      }

      const { notes, total } = await listNotesInNotebook(notebook.id, PAGE_SIZE, 0);
      const embed = buildBrowseEmbed(notebook.name, notes, 0, total);
      const components = buildBrowseComponents(notebook.id, 0, total, PAGE_SIZE);
      await interaction.editReply({ embeds: [embed], components });
    } else {
      // Show notebook picker
      const notebooks = await listNotebooks(scope);
      if (notebooks.length === 0) {
        await interaction.editReply({
          embeds: [createErrorEmbed("No notebooks yet. Use `/save <topic>` to create your first.")],
        });
        return;
      }

      const options = notebooks.map(nb => ({
        label: nb.name,
        description: `${nb.note_count} note${nb.note_count === 1 ? "" : "s"}`,
        value: String(nb.id),
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(encodeCustomId("browse", "nb"))
        .setPlaceholder("Choose a notebook to browse...")
        .addOptions(options.slice(0, 25));

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      await interaction.editReply({ content: "**Browse Notebooks**", components: [row] });
    }
  } catch (error) {
    console.error("Browse command error:", error);
    await interaction.editReply({ embeds: [createErrorEmbed("Something went wrong.")] });
  }
}
