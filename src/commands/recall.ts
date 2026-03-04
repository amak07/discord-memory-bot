import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";
import { embedForQuery } from "../services/ai.js";
import { listNotebooks } from "../services/db.js";
import { resolveScope } from "../utils/scope.js";
import { encodeCustomId } from "../utils/custom-ids.js";
import { createErrorEmbed } from "../utils/embeds.js";
import { pendingRecalls, type PendingRecall } from "../interactions/recall-scope.js";
import crypto from "node:crypto";

export async function handleRecall(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("query", true);
  const scope = resolveScope(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const queryEmbedding = await embedForQuery(query);
    const notebooks = await listNotebooks(scope);

    if (notebooks.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No notebooks yet. Use `/save <topic>` to save your first note.")],
      });
      return;
    }

    // Store pending recall
    const recallId = crypto.randomUUID().slice(0, 8);
    const pending: PendingRecall = {
      query,
      queryEmbedding,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      userId: interaction.user.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    pendingRecalls.set(recallId, pending);

    // Build notebook picker
    if (notebooks.length <= 9) {
      // Use buttons
      const buttons = notebooks.map((nb) =>
        new ButtonBuilder()
          .setCustomId(encodeCustomId("recall", "scope", recallId, String(nb.id)))
          .setLabel(nb.name)
          .setStyle(ButtonStyle.Secondary)
      );
      buttons.push(
        new ButtonBuilder()
          .setCustomId(encodeCustomId("recall", "scope", recallId, "all"))
          .setLabel("All Notebooks")
          .setStyle(ButtonStyle.Primary)
      );

      // Split into rows of 5
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
      }

      await interaction.editReply({
        content: `**Search in:**\nQuery: "${query}"`,
        components: rows,
      });
    } else {
      // Use select menu for many notebooks
      const options = notebooks.map((nb) => ({
        label: nb.name,
        description: `${nb.note_count} note${nb.note_count === 1 ? "" : "s"}`,
        value: String(nb.id),
      }));
      options.push({ label: "All Notebooks", description: "Search everything", value: "all" });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(encodeCustomId("recall", "scope", recallId))
        .setPlaceholder("Choose a notebook to search...")
        .addOptions(options.slice(0, 25));

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      await interaction.editReply({
        content: `**Search in:**\nQuery: "${query}"`,
        components: [row],
      });
    }
  } catch (error) {
    console.error("Recall command error:", error);
    await interaction.editReply({
      embeds: [createErrorEmbed("Something went wrong.")],
    });
  }
}
