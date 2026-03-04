import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { parseCustomId, encodeCustomId } from "../utils/custom-ids.js";
import {
  listNotesInNotebook,
  getNote,
  getNotebook,
  getDistinctTags,
  listNotesByTag,
} from "../services/db.js";
import { createNoteDetailEmbed, createErrorEmbed, COLORS } from "../utils/embeds.js";
import { resolveScope } from "../utils/scope.js";
import type { Note } from "../types.js";

const PAGE_SIZE = 5;

// ---------------------------------------------------------------------------
// Public helpers (also used by browse.ts command)
// ---------------------------------------------------------------------------

/** Build the paginated browse embed showing a list of notes. */
export function buildBrowseEmbed(
  notebookName: string,
  notes: Note[],
  offset: number,
  total: number
): EmbedBuilder {
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  let description: string;
  if (notes.length === 0) {
    description = "No notes in this notebook yet.";
  } else {
    const lines = notes.map((note, i) => {
      const num = offset + i + 1;
      const date = new Date(note.created_at).toLocaleDateString();
      const preview =
        note.summary.length > 80
          ? note.summary.slice(0, 80) + "..."
          : note.summary;

      // Parse tags
      let tagsStr = "";
      try {
        const tags: string[] = note.tags ? JSON.parse(note.tags) : [];
        if (tags.length > 0) {
          tagsStr = " " + tags.map(t => `\`${t}\``).join(" ");
        }
      } catch {
        // skip malformed tags
      }

      return `**${num}. ${note.topic}** (${date})${tagsStr}\n${preview}`;
    });
    description = lines.join("\n\n");
  }

  return new EmbedBuilder()
    .setColor(COLORS.browse)
    .setTitle(`${notebookName} (${total} note${total === 1 ? "" : "s"})`)
    .setDescription(description)
    .setFooter({ text: `Page ${currentPage} of ${totalPages}` });
}

/** Build the action row components for pagination and filtering. */
export function buildBrowseComponents(
  notebookId: number,
  offset: number,
  total: number,
  pageSize: number
): ActionRowBuilder<ButtonBuilder>[] {
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Row 1: Pagination buttons
  const navRow = new ActionRowBuilder<ButtonBuilder>();

  // Previous button — hidden on first page
  if (currentPage > 1) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeCustomId("browse", "prev", String(notebookId), String(offset - pageSize)))
        .setLabel("Prev")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Page indicator (disabled button)
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId("browse", "page", String(notebookId)))
      .setLabel(`Page ${currentPage}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  // Next button — hidden on last page
  if (currentPage < totalPages) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeCustomId("browse", "next", String(notebookId), String(offset + pageSize)))
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  rows.push(navRow);

  // Row 2: Filter by Tag button (only if there are notes)
  if (total > 0) {
    const filterRow = new ActionRowBuilder<ButtonBuilder>();
    filterRow.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeCustomId("browse", "filter", String(notebookId)))
        .setLabel("Filter by Tag")
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(filterRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Interaction handler (dispatched from handler.ts)
// ---------------------------------------------------------------------------

/**
 * Central handler for all browse-flow component interactions.
 * Dispatches based on subaction parsed from customId.
 */
export async function handleBrowseInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  const { subaction, data } = parseCustomId(interaction.customId);

  try {
    switch (subaction) {
      case "nb":
        await handleNotebookSelect(interaction as StringSelectMenuInteraction);
        break;
      case "prev":
      case "next":
        await handlePageChange(interaction as ButtonInteraction, data);
        break;
      case "detail":
        await handleNoteDetail(interaction as ButtonInteraction, data[0]);
        break;
      case "filter":
        await handleFilterByTag(interaction as ButtonInteraction, data[0]);
        break;
      case "tag":
        await handleTagSelected(interaction as StringSelectMenuInteraction, data[0], data[1]);
        break;
      case "clear":
        await handleClearFilter(interaction as ButtonInteraction, data[0]);
        break;
      default:
        await interaction.reply({ content: "Unknown browse action.", ephemeral: true });
    }
  } catch (error) {
    console.error("Browse interaction error:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [createErrorEmbed("Something went wrong.")] }).catch(() => {});
    } else {
      await interaction.reply({
        embeds: [createErrorEmbed("Something went wrong.")],
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-handlers
// ---------------------------------------------------------------------------

/** Handle notebook selection from the dropdown. */
async function handleNotebookSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const notebookId = parseInt(interaction.values[0], 10);
  const scope = resolveScope(interaction);

  const notebook = await getNotebook(notebookId, scope);
  if (!notebook) {
    await interaction.update({
      content: null,
      embeds: [createErrorEmbed("Notebook not found.")],
      components: [],
    });
    return;
  }

  const { notes, total } = await listNotesInNotebook(notebookId, PAGE_SIZE, 0);
  const embed = buildBrowseEmbed(notebook.name, notes, 0, total);
  const components = buildBrowseComponents(notebookId, 0, total, PAGE_SIZE);

  // Add detail buttons for each note
  const allComponents = [...components, ...buildNoteDetailButtons(notes, 0)];

  await interaction.update({
    content: null,
    embeds: [embed],
    components: allComponents.slice(0, 5), // Discord max 5 action rows
  });
}

/** Handle prev/next pagination. */
async function handlePageChange(
  interaction: ButtonInteraction,
  data: string[]
): Promise<void> {
  const notebookId = parseInt(data[0], 10);
  const newOffset = parseInt(data[1], 10);
  const scope = resolveScope(interaction);

  const notebook = await getNotebook(notebookId, scope);
  if (!notebook) {
    await interaction.update({
      embeds: [createErrorEmbed("Notebook not found.")],
      components: [],
    });
    return;
  }

  const { notes, total } = await listNotesInNotebook(notebookId, PAGE_SIZE, newOffset);
  const embed = buildBrowseEmbed(notebook.name, notes, newOffset, total);
  const components = buildBrowseComponents(notebookId, newOffset, total, PAGE_SIZE);

  const allComponents = [...components, ...buildNoteDetailButtons(notes, newOffset)];

  await interaction.update({
    embeds: [embed],
    components: allComponents.slice(0, 5),
  });
}

/** Show full detail for a specific note (new ephemeral message, not an update). */
async function handleNoteDetail(
  interaction: ButtonInteraction,
  noteIdStr: string
): Promise<void> {
  const noteId = parseInt(noteIdStr, 10);
  if (isNaN(noteId)) {
    await interaction.reply({
      embeds: [createErrorEmbed("Invalid note ID.")],
      ephemeral: true,
    });
    return;
  }

  const note = await getNote(noteId);
  if (!note) {
    await interaction.reply({
      embeds: [createErrorEmbed("Note not found. It may have been deleted.")],
      ephemeral: true,
    });
    return;
  }

  // Parse tags
  let tags: string[] = [];
  try {
    if (note.tags) {
      tags = JSON.parse(note.tags);
    }
  } catch {
    // skip malformed
  }

  // Get notebook name
  let notebookName = "Unknown";
  if (note.notebook_id && note.scope_type && note.scope_id) {
    const notebook = await getNotebook(note.notebook_id, {
      scopeType: note.scope_type as "server" | "dm",
      scopeId: note.scope_id,
    });
    if (notebook) {
      notebookName = notebook.name;
    }
  }

  const embed = createNoteDetailEmbed({
    topic: note.topic,
    summary: note.summary,
    notebookName,
    tags,
    createdBy: note.created_by_name,
    createdAt: new Date(note.created_at).toLocaleDateString(),
  });

  // Reply with a new ephemeral message (don't update the browse list)
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

/** Show a tag filter dropdown for the notebook. */
async function handleFilterByTag(
  interaction: ButtonInteraction,
  notebookIdStr: string
): Promise<void> {
  const notebookId = parseInt(notebookIdStr, 10);
  const scope = resolveScope(interaction);

  const tags = await getDistinctTags(scope, notebookId);

  if (tags.length === 0) {
    await interaction.reply({
      embeds: [createErrorEmbed("No tags found in this notebook.")],
      ephemeral: true,
    });
    return;
  }

  const options = tags.map(tag => ({
    label: tag,
    value: tag,
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encodeCustomId("browse", "tag", String(notebookId)))
    .setPlaceholder("Filter by tag...")
    .addOptions(options.slice(0, 25));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.browse)
        .setTitle("Filter by Tag")
        .setDescription("Select a tag to filter notes."),
    ],
    components: [row],
  });
}

/** Handle tag selection — show filtered notes. */
async function handleTagSelected(
  interaction: StringSelectMenuInteraction,
  notebookIdStr: string,
  _extra?: string
): Promise<void> {
  const notebookId = parseInt(notebookIdStr, 10);
  const tag = interaction.values[0];
  const scope = resolveScope(interaction);

  // Get notebook name
  const notebook = await getNotebook(notebookId, scope);
  const notebookName = notebook?.name ?? "Unknown";

  const { notes, total } = await listNotesByTag(scope, tag, notebookId, PAGE_SIZE, 0);

  const embed = buildBrowseEmbed(notebookName, notes, 0, total)
    .setTitle(`${notebookName} — Tag: \`${tag}\` (${total} note${total === 1 ? "" : "s"})`);

  // Build clear filter button
  const clearRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeCustomId("browse", "clear", String(notebookId)))
      .setLabel("Clear Filter")
      .setStyle(ButtonStyle.Danger)
  );

  const detailRows = buildNoteDetailButtons(notes, 0);

  await interaction.update({
    embeds: [embed],
    components: [clearRow, ...detailRows].slice(0, 5),
  });
}

/** Clear tag filter — go back to unfiltered browse view. */
async function handleClearFilter(
  interaction: ButtonInteraction,
  notebookIdStr: string
): Promise<void> {
  const notebookId = parseInt(notebookIdStr, 10);
  const scope = resolveScope(interaction);

  const notebook = await getNotebook(notebookId, scope);
  if (!notebook) {
    await interaction.update({
      embeds: [createErrorEmbed("Notebook not found.")],
      components: [],
    });
    return;
  }

  const { notes, total } = await listNotesInNotebook(notebookId, PAGE_SIZE, 0);
  const embed = buildBrowseEmbed(notebook.name, notes, 0, total);
  const components = buildBrowseComponents(notebookId, 0, total, PAGE_SIZE);

  const allComponents = [...components, ...buildNoteDetailButtons(notes, 0)];

  await interaction.update({
    embeds: [embed],
    components: allComponents.slice(0, 5),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a row of buttons for viewing individual note details. */
function buildNoteDetailButtons(
  notes: Note[],
  offset: number
): ActionRowBuilder<ButtonBuilder>[] {
  if (notes.length === 0) return [];

  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeCustomId("browse", "detail", String(note.id)))
        .setLabel(`#${offset + i + 1}`)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return [row];
}
