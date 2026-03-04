import { Client, Events, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import { initDb } from "./services/db.js";
import { handleSave } from "./commands/save.js";
import { handleRecall } from "./commands/recall.js";
import { handleNotes } from "./commands/notes.js";
import { handleBrowse } from "./commands/browse.js";
import { handleComponentInteraction } from "./interactions/handler.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Bot is online as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    try {
      switch (interaction.commandName) {
        case "save":
          await handleSave(interaction);
          break;
        case "recall":
          await handleRecall(interaction);
          break;
        case "notes":
          await handleNotes(interaction);
          break;
        case "browse":
          await handleBrowse(interaction);
          break;
        default:
          await interaction.reply({ content: "Unknown command.", ephemeral: true });
      }
    } catch (error) {
      console.error(`Unhandled error in command ${interaction.commandName}:`, error);
      const reply = interaction.deferred || interaction.replied
        ? interaction.editReply("An unexpected error occurred.")
        : interaction.reply({ content: "An unexpected error occurred.", ephemeral: true });
      await reply.catch(() => {});
    }
  } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
    try {
      await handleComponentInteraction(interaction);
    } catch (error) {
      console.error(`Unhandled error in component interaction ${interaction.customId}:`, error);
      const reply = interaction.deferred || interaction.replied
        ? interaction.editReply("An unexpected error occurred.")
        : interaction.reply({ content: "An unexpected error occurred.", ephemeral: true });
      await reply.catch(() => {});
    }
  }
});

async function main() {
  try {
    console.log("Initializing database...");
    await initDb();
    console.log("Database ready.");

    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("Shutting down...");
  client.destroy();
  process.exit(0);
});

main();
