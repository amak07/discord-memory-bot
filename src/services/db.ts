import { createClient, type Client } from "@libsql/client";
import type { Note, Notebook, NotebookWithCount, Scope } from "../types.js";

let db: Client;

export function getDb(): Client {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return db;
}

export async function initDb(): Promise<void> {
  const client = getDb();

  // Create notes table (without embedding for backwards compat — migration adds it)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      summary TEXT NOT NULL,
      raw_messages TEXT,
      created_by_id TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_server ON notes(server_id);
    CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(server_id, topic);
  `);

  // Add embedding column if it doesn't exist yet
  try {
    await client.execute({ sql: "ALTER TABLE notes ADD COLUMN embedding F32_BLOB(768)", args: [] });
    console.log("Migrated: added embedding column to notes table.");
  } catch {
    // Column already exists — expected
  }

  // Create vector index (safe to run even if it exists)
  try {
    await client.execute({ sql: "CREATE INDEX IF NOT EXISTS notes_embedding_idx ON notes(libsql_vector_idx(embedding))", args: [] });
  } catch {
    // Index may already exist
  }

  // --- V2 migrations ---

  // Create notebooks table
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('server', 'dm')),
      scope_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_by_id TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      archived_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(scope_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_notebooks_scope ON notebooks(scope_type, scope_id);
  `);

  // Add V2 columns to notes (each in try/catch for idempotency)
  try {
    await client.execute({ sql: "ALTER TABLE notes ADD COLUMN notebook_id INTEGER", args: [] });
    console.log("Migrated: added notebook_id column to notes table.");
  } catch {
    // Column already exists — expected
  }

  try {
    await client.execute({ sql: "ALTER TABLE notes ADD COLUMN tags TEXT DEFAULT '[]'", args: [] });
    console.log("Migrated: added tags column to notes table.");
  } catch {
    // Column already exists — expected
  }

  try {
    await client.execute({ sql: "ALTER TABLE notes ADD COLUMN scope_type TEXT DEFAULT 'server'", args: [] });
    console.log("Migrated: added scope_type column to notes table.");
  } catch {
    // Column already exists — expected
  }

  try {
    await client.execute({ sql: "ALTER TABLE notes ADD COLUMN scope_id TEXT", args: [] });
    console.log("Migrated: added scope_id column to notes table.");
  } catch {
    // Column already exists — expected
  }

  // V1 data migration: assign existing notes to "General" notebooks
  // Find all distinct server_ids that have notes without a notebook_id
  const orphanedServers = await client.execute({
    sql: "SELECT DISTINCT server_id FROM notes WHERE notebook_id IS NULL",
    args: [],
  });

  for (const row of orphanedServers.rows) {
    const serverId = row.server_id as string;

    // Create a "General" notebook for this server (INSERT OR IGNORE for idempotency)
    await client.execute({
      sql: `INSERT OR IGNORE INTO notebooks (scope_type, scope_id, name, created_by_id, created_by_name)
            VALUES ('server', ?, 'General', 'system', 'System Migration')`,
      args: [serverId],
    });

    // Get the General notebook ID for this server
    const nbResult = await client.execute({
      sql: "SELECT id FROM notebooks WHERE scope_id = ? AND name = 'General'",
      args: [serverId],
    });

    if (nbResult.rows.length > 0) {
      const notebookId = nbResult.rows[0].id as number;

      // Assign orphaned notes to the General notebook and set scope_id
      await client.execute({
        sql: "UPDATE notes SET notebook_id = ?, scope_type = 'server', scope_id = ? WHERE server_id = ? AND notebook_id IS NULL",
        args: [notebookId, serverId, serverId],
      });
    }
  }

  if (orphanedServers.rows.length > 0) {
    console.log(`Migrated: assigned ${orphanedServers.rows.length} server(s) of V1 notes to General notebooks.`);
  }
}

// --- Notebook CRUD ---

export async function getOrCreateNotebook(
  scope: Scope, name: string, userId: string, userName: string
): Promise<Notebook> {
  const client = getDb();

  // Try insert, ignore if already exists (UNIQUE constraint on scope_id + name)
  await client.execute({
    sql: `INSERT OR IGNORE INTO notebooks (scope_type, scope_id, name, created_by_id, created_by_name)
          VALUES (?, ?, ?, ?, ?)`,
    args: [scope.scopeType, scope.scopeId, name, userId, userName],
  });

  // Fetch and return the notebook
  const result = await client.execute({
    sql: "SELECT * FROM notebooks WHERE scope_id = ? AND name = ?",
    args: [scope.scopeId, name],
  });

  return result.rows[0] as unknown as Notebook;
}

export async function listNotebooks(
  scope: Scope, includeArchived = false
): Promise<NotebookWithCount[]> {
  const client = getDb();

  const archivedClause = includeArchived ? "" : "AND nb.archived_at IS NULL";

  const result = await client.execute({
    sql: `SELECT nb.*, COUNT(n.id) AS note_count
          FROM notebooks nb
          LEFT JOIN notes n ON n.notebook_id = nb.id
          WHERE nb.scope_type = ? AND nb.scope_id = ? ${archivedClause}
          GROUP BY nb.id
          ORDER BY nb.created_at ASC`,
    args: [scope.scopeType, scope.scopeId],
  });

  return result.rows as unknown as NotebookWithCount[];
}

export async function getNotebook(id: number, scope: Scope): Promise<Notebook | null> {
  const client = getDb();

  const result = await client.execute({
    sql: "SELECT * FROM notebooks WHERE id = ? AND scope_type = ? AND scope_id = ?",
    args: [id, scope.scopeType, scope.scopeId],
  });

  return result.rows.length > 0 ? (result.rows[0] as unknown as Notebook) : null;
}

export async function getNotebookByName(scope: Scope, name: string): Promise<Notebook | null> {
  const client = getDb();

  const result = await client.execute({
    sql: "SELECT * FROM notebooks WHERE scope_type = ? AND scope_id = ? AND name = ?",
    args: [scope.scopeType, scope.scopeId, name],
  });

  return result.rows.length > 0 ? (result.rows[0] as unknown as Notebook) : null;
}

export async function archiveNotebook(id: number, scope: Scope): Promise<boolean> {
  const client = getDb();

  const result = await client.execute({
    sql: "UPDATE notebooks SET archived_at = datetime('now') WHERE id = ? AND scope_type = ? AND scope_id = ?",
    args: [id, scope.scopeType, scope.scopeId],
  });

  return result.rowsAffected > 0;
}

export async function deleteNotebook(id: number, scope: Scope): Promise<boolean> {
  const client = getDb();

  // Delete all notes in the notebook first
  await client.execute({
    sql: "DELETE FROM notes WHERE notebook_id = ?",
    args: [id],
  });

  // Delete the notebook itself
  const result = await client.execute({
    sql: "DELETE FROM notebooks WHERE id = ? AND scope_type = ? AND scope_id = ?",
    args: [id, scope.scopeType, scope.scopeId],
  });

  return result.rowsAffected > 0;
}

// --- Note functions (V2-extended) ---

export async function saveNote(note: Omit<Note, "id" | "created_at">, embedding: number[]): Promise<Note> {
  const client = getDb();
  const vectorStr = `[${embedding.join(",")}]`;
  const tags = note.tags ?? "[]";

  const result = await client.execute({
    sql: `INSERT INTO notes (server_id, channel_id, topic, summary, raw_messages, created_by_id, created_by_name, embedding, notebook_id, tags, scope_type, scope_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?)`,
    args: [
      note.server_id,
      note.channel_id,
      note.topic,
      note.summary,
      note.raw_messages,
      note.created_by_id,
      note.created_by_name,
      vectorStr,
      note.notebook_id ?? null,
      tags,
      note.scope_type ?? "server",
      note.scope_id ?? note.server_id,
    ],
  });

  const inserted = await client.execute({
    sql: `SELECT id, server_id, channel_id, topic, summary, raw_messages, created_by_id, created_by_name, created_at,
                 notebook_id, tags, scope_type, scope_id
          FROM notes WHERE id = ?`,
    args: [result.lastInsertRowid!],
  });

  return inserted.rows[0] as unknown as Note;
}

export async function searchNotes(
  serverId: string,
  queryEmbedding: number[],
  notebookId?: number,
  scope?: Scope
): Promise<(Note & { notebook_name?: string })[]> {
  const client = getDb();
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Build WHERE clauses dynamically
  const conditions: string[] = [];
  const args: (string | number)[] = [vectorStr];

  if (scope) {
    conditions.push("n.scope_type = ?");
    conditions.push("n.scope_id = ?");
    args.push(scope.scopeType, scope.scopeId);
  } else {
    conditions.push("n.server_id = ?");
    args.push(serverId);
  }

  if (notebookId !== undefined) {
    conditions.push("n.notebook_id = ?");
    args.push(notebookId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await client.execute({
    sql: `SELECT n.id, n.server_id, n.channel_id, n.topic, n.summary, n.raw_messages,
                 n.created_by_id, n.created_by_name, n.created_at,
                 n.notebook_id, n.tags, n.scope_type, n.scope_id,
                 nb.name AS notebook_name
          FROM vector_top_k('notes_embedding_idx', vector32(?), 5) AS v
          JOIN notes AS n ON n.rowid = v.id
          LEFT JOIN notebooks nb ON nb.id = n.notebook_id
          ${whereClause}`,
    args,
  });

  return result.rows as unknown as (Note & { notebook_name?: string })[];
}

export async function listNotes(serverId: string, limit = 10, offset = 0): Promise<{ notes: Note[]; total: number }> {
  const client = getDb();

  const [notesResult, countResult] = await Promise.all([
    client.execute({
      sql: "SELECT * FROM notes WHERE server_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      args: [serverId, limit, offset],
    }),
    client.execute({
      sql: "SELECT COUNT(*) as count FROM notes WHERE server_id = ?",
      args: [serverId],
    }),
  ]);

  return {
    notes: notesResult.rows as unknown as Note[],
    total: Number(countResult.rows[0].count),
  };
}

export async function deleteNote(id: number, serverId: string): Promise<boolean> {
  const client = getDb();
  const result = await client.execute({
    sql: "DELETE FROM notes WHERE id = ? AND server_id = ?",
    args: [id, serverId],
  });

  return result.rowsAffected > 0;
}

// --- New query functions ---

export async function listNotesInNotebook(
  notebookId: number, limit = 10, offset = 0
): Promise<{ notes: Note[]; total: number }> {
  const client = getDb();

  const [notesResult, countResult] = await Promise.all([
    client.execute({
      sql: "SELECT * FROM notes WHERE notebook_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      args: [notebookId, limit, offset],
    }),
    client.execute({
      sql: "SELECT COUNT(*) as count FROM notes WHERE notebook_id = ?",
      args: [notebookId],
    }),
  ]);

  return {
    notes: notesResult.rows as unknown as Note[],
    total: Number(countResult.rows[0].count),
  };
}

export async function getNote(id: number): Promise<Note | null> {
  const client = getDb();

  const result = await client.execute({
    sql: `SELECT id, server_id, channel_id, topic, summary, raw_messages, created_by_id, created_by_name, created_at,
                 notebook_id, tags, scope_type, scope_id
          FROM notes WHERE id = ?`,
    args: [id],
  });

  return result.rows.length > 0 ? (result.rows[0] as unknown as Note) : null;
}

export async function getLastSaveInChannel(channelId: string): Promise<string | null> {
  const client = getDb();

  const result = await client.execute({
    sql: "SELECT created_at FROM notes WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [channelId],
  });

  return result.rows.length > 0 ? (result.rows[0].created_at as string) : null;
}

export async function getDistinctTags(scope: Scope, notebookId?: number): Promise<string[]> {
  const client = getDb();

  // Build query — tags are stored as JSON arrays, so we need to extract individual values
  const conditions: string[] = ["scope_type = ?", "scope_id = ?"];
  const args: (string | number)[] = [scope.scopeType, scope.scopeId];

  if (notebookId !== undefined) {
    conditions.push("notebook_id = ?");
    args.push(notebookId);
  }

  const whereClause = conditions.join(" AND ");

  // Fetch all tags columns, then parse and deduplicate in JS
  // (Turso/SQLite doesn't have native JSON array unnest)
  const result = await client.execute({
    sql: `SELECT DISTINCT tags FROM notes WHERE ${whereClause} AND tags IS NOT NULL AND tags != '[]'`,
    args,
  });

  const tagSet = new Set<string>();
  for (const row of result.rows) {
    try {
      const parsed = JSON.parse(row.tags as string) as string[];
      for (const tag of parsed) {
        tagSet.add(tag);
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return Array.from(tagSet).sort();
}

export async function listNotesByTag(
  scope: Scope, tag: string, notebookId?: number, limit = 10, offset = 0
): Promise<{ notes: Note[]; total: number }> {
  const client = getDb();

  // Use LIKE to find notes whose tags JSON array contains the tag
  // This works because tags are stored as '["tag1","tag2"]'
  const tagPattern = `%"${tag}"%`;

  const conditions: string[] = ["scope_type = ?", "scope_id = ?", "tags LIKE ?"];
  const args: (string | number)[] = [scope.scopeType, scope.scopeId, tagPattern];

  if (notebookId !== undefined) {
    conditions.push("notebook_id = ?");
    args.push(notebookId);
  }

  const whereClause = conditions.join(" AND ");

  const [notesResult, countResult] = await Promise.all([
    client.execute({
      sql: `SELECT * FROM notes WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
    client.execute({
      sql: `SELECT COUNT(*) as count FROM notes WHERE ${whereClause}`,
      args,
    }),
  ]);

  return {
    notes: notesResult.rows as unknown as Note[],
    total: Number(countResult.rows[0].count),
  };
}
