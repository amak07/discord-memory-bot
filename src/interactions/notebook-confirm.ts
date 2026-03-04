import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { parseCustomId } from "../utils/custom-ids.js";
import { deleteNotebook, getNotebook } from "../services/db.js";
import { resolveScope } from "../utils/scope.js";
import { createErrorEmbed, COLORS } from "../utils/embeds.js";

/**
 * Handle notebook management button interactions (delete confirm/cancel).
 */
export async function handleNotebookInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  const { subaction, data } = parseCustomId(interaction.customId);
  const notebookId = parseInt(data[0], 10);

  if (isNaN(notebookId)) {
    await interaction.update({
      embeds: [createErrorEmbed("Invalid notebook reference.")],
      components: [],
    });
    return;
  }

  const scope = resolveScope(interaction);

  switch (subaction) {
    case "delyes": {
      // Verify the notebook still exists before deleting
      const notebook = await getNotebook(notebookId, scope);
      if (!notebook) {
        await interaction.update({
          embeds: [createErrorEmbed("Notebook not found. It may have already been deleted.")],
          components: [],
        });
        return;
      }

      await deleteNotebook(notebookId, scope);

      const embed = new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle("Notebook Deleted")
        .setDescription(`"**${notebook.name}**" and all its notes have been deleted.`);
      await interaction.update({ embeds: [embed], components: [] });
      break;
    }
    case "delno": {
      const embed = new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle("Delete Cancelled")
        .setDescription("No changes were made.");
      await interaction.update({ embeds: [embed], components: [] });
      break;
    }
    default:
      await interaction.reply({ content: "Unknown action.", ephemeral: true });
  }
}
