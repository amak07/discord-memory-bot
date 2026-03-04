import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { parseCustomId } from '../utils/custom-ids.js';

/**
 * Central router for Discord component interactions (buttons and select menus).
 *
 * Parses the customId to determine the action, then dynamically imports
 * the appropriate handler module. Dynamic imports are used so that this file
 * compiles even before the handler modules exist (Tasks 6-9 add them).
 *
 * The @ts-ignore comments suppress TS2307 for modules that don't exist yet.
 * Each will be removed when its corresponding task creates the module.
 */
export async function handleComponentInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  const { action } = parseCustomId(interaction.customId);

  switch (action) {
    case 'save': {
      const { handleSaveInteraction } = await import('./save-confirm.js');
      await handleSaveInteraction(interaction);
      break;
    }
    case 'recall': {
      const { handleRecallInteraction } = await import('./recall-scope.js');
      await handleRecallInteraction(interaction);
      break;
    }
    case 'rsrc': {
      const { handleRecallSourceInteraction } = await import('./recall-sources.js');
      await handleRecallSourceInteraction(interaction);
      break;
    }
    case 'browse': {
      // Task 8: Browse/pagination
      // @ts-ignore -- module created in Task 8
      const { handleBrowseInteraction } = await import('./browse-pagination.js');
      await handleBrowseInteraction(interaction);
      break;
    }
    case 'nb': {
      // Task 9: Notebook management confirmations
      // @ts-ignore -- module created in Task 9
      const { handleNotebookInteraction } = await import('./notebook-confirm.js');
      await handleNotebookInteraction(interaction);
      break;
    }
    default:
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'Unknown interaction.', ephemeral: true });
      }
  }
}
