import { ChatInputCommandInteraction, EmbedBuilder, TextChannel } from "discord.js";
import { fetchRecentMessages } from "../services/messages.js";
import { summarizeConversation, embedForStorage } from "../services/ai.js";
import { saveNote } from "../services/db.js";

export async function handleSave(interaction: ChatInputCommandInteraction): Promise<void> {
  const topic = interaction.options.getString("topic", true);
  const channel = interaction.channel as TextChannel;

  await interaction.deferReply();

  try {
    const messages = await fetchRecentMessages(channel);

    if (messages.length === 0) {
      await interaction.editReply("No recent messages found to summarize.");
      return;
    }

    const summary = await summarizeConversation(topic, messages);

    if (summary.trim() === "NO_MATCH") {
      await interaction.editReply(
        `I couldn't find information about "${topic}" in the recent conversation. Try a different topic, or make sure the relevant messages are within the last 50 messages.`
      );
      return;
    }

    const embedding = await embedForStorage(summary);

    const note = await saveNote({
      server_id: interaction.guildId!,
      channel_id: channel.id,
      topic,
      summary,
      raw_messages: JSON.stringify(messages),
      created_by_id: interaction.user.id,
      created_by_name: interaction.user.displayName,
    }, embedding);

    const embed = new EmbedBuilder()
      .setTitle(`Note Saved: "${topic}"`)
      .setDescription(summary)
      .setColor(0x57f287)
      .setFooter({
        text: `Saved by ${interaction.user.displayName}`,
      })
      .setTimestamp(new Date(note.created_at));

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Save command error:", error);
    await interaction.editReply("Something went wrong while saving the note. Please try again.");
  }
}
