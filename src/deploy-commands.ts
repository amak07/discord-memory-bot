import { REST, Routes, SlashCommandBuilder } from "discord.js";
import "dotenv/config";

const commands = [
  new SlashCommandBuilder()
    .setName("save")
    .setDescription("Save a summary of recent conversation")
    .addStringOption((option) =>
      option
        .setName("topic")
        .setDescription("What topic to summarize (e.g. 'landscaping discussion')")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("recall")
    .setDescription("Recall information from saved notes")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("What do you want to know? (e.g. 'landscaper contact info')")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("notes")
    .setDescription("List all saved notes for this server")
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Page number (default: 1)")
        .setMinValue(1)
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    const clientId = process.env.DISCORD_CLIENT_ID!;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (guildId) {
      console.log(`Registering ${commands.length} guild commands (instant)...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
    } else {
      console.log(`Registering ${commands.length} global commands (up to 1 hour)...`);
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
    }

    console.log("Slash commands registered successfully!");
  } catch (error) {
    console.error("Failed to register commands:", error);
    process.exit(1);
  }
})();
