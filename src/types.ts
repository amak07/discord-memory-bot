export interface Note {
  id: number;
  server_id: string;
  channel_id: string;
  topic: string;
  summary: string;
  raw_messages: string | null;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  // V2 fields (optional — V1 notes won't have them)
  notebook_id?: number;
  tags?: string; // JSON array stored as string
  scope_type?: string;
  scope_id?: string;
}

export interface SavedMessage {
  author: string;
  content: string;
  timestamp: string;
}

export interface Notebook {
  id: number;
  scope_type: 'server' | 'dm';
  scope_id: string;
  name: string;
  created_by_id: string;
  created_by_name: string;
  archived_at: string | null;
  created_at: string;
}

export interface NotebookWithCount extends Notebook {
  note_count: number;
}

export interface Scope {
  scopeType: 'server' | 'dm';
  scopeId: string;
}
