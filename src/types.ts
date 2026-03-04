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
}

export interface SavedMessage {
  author: string;
  content: string;
  timestamp: string;
}
