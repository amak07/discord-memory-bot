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
  new SlashCommandBuilder()
    .setName("browse")
    .setDescription("Browse notebooks and notes with pagination")
    .addStringOption((option) =>
      option
        .setName("notebook")
        .setDescription("Go directly to a specific notebook (optional)")
    ),
  new SlashCommandBuilder()
    .setName("notebook")
    .setDescription("Manage notebooks (create, list, archive, delete)")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new notebook")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name for the notebook")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all notebooks")
    )
    .addSubcommand((sub) =>
      sub
        .setName("archive")
        .setDescription("Archive a notebook (notes preserved but hidden)")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the notebook to archive")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a notebook and all its notes")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the notebook to delete")
            .setRequired(true)
        )
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
