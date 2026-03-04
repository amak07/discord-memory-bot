import { ChatInputCommandInteraction, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { fetchRecentMessages } from "../services/messages.js";
import { summarizeConversation, embedForStorage, classifyAndTag } from "../services/ai.js";
import { getLastSaveInChannel, listNotebooks } from "../services/db.js";
import { resolveScope } from "../utils/scope.js";
import { encodeCustomId } from "../utils/custom-ids.js";
import { createSaveEmbed, createErrorEmbed } from "../utils/embeds.js";
import { pendingSaves, type PendingSave } from "../interactions/save-confirm.js";
import crypto from "node:crypto";

export async function handleSave(interaction: ChatInputCommandInteraction): Promise<void> {
  const topic = interaction.options.getString("topic", true);
  const channel = interaction.channel as TextChannel;
  const scope = resolveScope(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Smart message capture: only fetch messages since last save in this channel
    const lastSave = await getLastSaveInChannel(channel.id);
    const messages = await fetchRecentMessages(channel, 100, lastSave ?? undefined);

    if (messages.length === 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("No recent messages found to summarize.")] });
      return;
    }

    // AI pipeline: summarize → classify/tag → embed
    const summary = await summarizeConversation(topic, messages);

    if (summary.trim() === "NO_MATCH") {
      await interaction.editReply({
        embeds: [createErrorEmbed(`I couldn't find information about "${topic}" in the recent conversation.`)]
      });
      return;
    }

    const embedding = await embedForStorage(summary);

    const notebooks = await listNotebooks(scope);
    const notebookNames = notebooks.map(nb => nb.name);
    const classification = await classifyAndTag(topic, summary, notebookNames);

    // Store pending save with 5-minute expiry
    const pendingId = crypto.randomUUID().slice(0, 8);
    const pending: PendingSave = {
      topic,
      summary,
      tags: classification.tags,
      notebookName: classification.notebook,
      notebookId: classification.isNew ? null : (notebooks.find(nb => nb.name === classification.notebook)?.id ?? null),
      embedding,
      rawMessages: JSON.stringify(messages),
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      userId: interaction.user.id,
      userName: interaction.user.displayName,
      channelId: channel.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    pendingSaves.set(pendingId, pending);

    // Build confirmation UI
    const embed = createSaveEmbed({
      topic,
      summary,
      notebookName: classification.notebook,
      tags: classification.tags,
      userName: interaction.user.displayName,
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

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error("Save command error:", error);
    await interaction.editReply({ embeds: [createErrorEmbed("Something went wrong while preparing the save.")] });
  }
}
