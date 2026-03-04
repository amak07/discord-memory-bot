import { createClient, type Client } from "@libsql/client";
import type { Note } from "../types.js";

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

  // Create table (without embedding for backwards compat — migration adds it)
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
}

export async function saveNote(note: Omit<Note, "id" | "created_at">, embedding: number[]): Promise<Note> {
  const client = getDb();
  const vectorStr = `[${embedding.join(",")}]`;
  const result = await client.execute({
    sql: `INSERT INTO notes (server_id, channel_id, topic, summary, raw_messages, created_by_id, created_by_name, embedding)
          VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?))`,
    args: [
      note.server_id,
      note.channel_id,
      note.topic,
      note.summary,
      note.raw_messages,
      note.created_by_id,
      note.created_by_name,
      vectorStr,
    ],
  });

  const inserted = await client.execute({
    sql: "SELECT id, server_id, channel_id, topic, summary, raw_messages, created_by_id, created_by_name, created_at FROM notes WHERE id = ?",
    args: [result.lastInsertRowid!],
  });

  return inserted.rows[0] as unknown as Note;
}

export async function searchNotes(serverId: string, queryEmbedding: number[]): Promise<Note[]> {
  const client = getDb();
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const result = await client.execute({
    sql: `SELECT n.id, n.server_id, n.channel_id, n.topic, n.summary, n.raw_messages, n.created_by_id, n.created_by_name, n.created_at
          FROM vector_top_k('notes_embedding_idx', vector32(?), 5) AS v
          JOIN notes AS n ON n.rowid = v.id
          WHERE n.server_id = ?`,
    args: [vectorStr, serverId],
  });

  return result.rows as unknown as Note[];
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
