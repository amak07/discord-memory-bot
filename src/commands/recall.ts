import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { searchNotes } from "../services/db.js";
import { answerFromNotes, embedForQuery } from "../services/ai.js";

export async function handleRecall(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("query", true);

  await interaction.deferReply();

  try {
    const queryEmbedding = await embedForQuery(query);
    const notes = await searchNotes(interaction.guildId!, queryEmbedding);

    if (notes.length === 0) {
      await interaction.editReply(
        "No saved notes yet. Use `/save <topic>` to save your first note."
      );
      return;
    }

    const answer = await answerFromNotes(query, notes);

    const sources = notes
      .slice(0, 3)
      .map((n) => `"${n.topic}" (saved ${new Date(n.created_at).toLocaleDateString()})`)
      .join(", ");

    const embed = new EmbedBuilder()
      .setTitle("Memory Recall")
      .setDescription(answer)
      .setColor(0x5865f2)
      .setFooter({ text: `Sources: ${sources}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Recall command error:", error);
    await interaction.editReply("Something went wrong while recalling notes. Please try again.");
  }
}
