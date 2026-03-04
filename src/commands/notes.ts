import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { listNotes } from "../services/db.js";

const NOTES_PER_PAGE = 10;

export async function handleNotes(interaction: ChatInputCommandInteraction): Promise<void> {
  const page = interaction.options.getInteger("page") ?? 1;
  const offset = (page - 1) * NOTES_PER_PAGE;

  await interaction.deferReply();

  try {
    const { notes, total } = await listNotes(interaction.guildId!, NOTES_PER_PAGE, offset);

    if (total === 0) {
      await interaction.editReply(
        "No saved notes yet. Use `/save <topic>` to save your first note!"
      );
      return;
    }

    const totalPages = Math.ceil(total / NOTES_PER_PAGE);

    const notesList = notes
      .map((n, i) => {
        const num = offset + i + 1;
        const date = new Date(n.created_at).toLocaleDateString();
        const preview = n.summary.length > 80 ? n.summary.slice(0, 80) + "..." : n.summary;
        return `**${num}. ${n.topic}** — ${date}\n${preview}`;
      })
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle(`Saved Notes (${total} total)`)
      .setDescription(notesList)
      .setColor(0xfee75c)
      .setFooter({ text: `Page ${page} of ${totalPages}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Notes command error:", error);
    await interaction.editReply("Something went wrong while listing notes. Please try again.");
  }
}
