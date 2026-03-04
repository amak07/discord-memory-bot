import { GoogleGenerativeAI, TaskType, type GenerativeModel } from "@google/generative-ai";
import type { SavedMessage } from "../types.js";

let genAI: GoogleGenerativeAI;
let model: GenerativeModel;
let jsonModel: GenerativeModel;
let embeddingModel: GenerativeModel;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }
  return genAI;
}

function getModel(): GenerativeModel {
  if (!model) {
    model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3 },
    });
  }
  return model;
}

function getJsonModel(): GenerativeModel {
  if (!jsonModel) {
    jsonModel = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });
  }
  return jsonModel;
}

function getEmbeddingModel(): GenerativeModel {
  if (!embeddingModel) {
    embeddingModel = getGenAI().getGenerativeModel({ model: "gemini-embedding-001" });
  }
  return embeddingModel;
}

const EMBEDDING_DIMS = 768;

export async function embedForStorage(text: string): Promise<number[]> {
  const result = await getEmbeddingModel().embedContent({
    content: { parts: [{ text }], role: "user" },
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });
  return result.embedding.values.slice(0, EMBEDDING_DIMS);
}

export async function embedForQuery(text: string): Promise<number[]> {
  const result = await getEmbeddingModel().embedContent({
    content: { parts: [{ text }], role: "user" },
    taskType: TaskType.RETRIEVAL_QUERY,
  });
  return result.embedding.values.slice(0, EMBEDDING_DIMS);
}

export async function summarizeConversation(topic: string, messages: SavedMessage[]): Promise<string> {
  const formatted = messages
    .map((m) => `@${m.author} (${m.timestamp}): ${m.content}`)
    .join("\n");

  const prompt = `You are a helpful note-taking assistant. A user wants to save information about "${topic}" from their Discord conversation.

Review the messages below and extract ONLY information directly relevant to "${topic}". Be concise but capture names, numbers, decisions, and action items.

IMPORTANT: If the messages do NOT contain meaningful information about "${topic}", respond with exactly: NO_MATCH

Messages:
${formatted}

Summary:`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

export async function classifyAndTag(
  topic: string,
  summary: string,
  existingNotebooks: string[],
): Promise<{ notebook: string; isNew: boolean; tags: string[] }> {
  const fallback = { notebook: "General", isNew: false, tags: [] as string[] };

  const notebookList =
    existingNotebooks.length > 0
      ? existingNotebooks.map((n) => `- ${n}`).join("\n")
      : "(none yet)";

  const prompt = `You are an organizational assistant. Given a note's topic and summary, classify it into a notebook and generate tags.

Existing notebooks:
${notebookList}

Rules:
- Pick the BEST existing notebook for this note. If none fit well, suggest a short, clear new notebook name.
- Generate 2-5 descriptive tags (lowercase, short, no spaces — use hyphens if needed).
- Respond with JSON only.

Note topic: "${topic}"
Note summary: "${summary}"

Respond with this exact JSON format:
{"notebook": "Name", "isNew": true/false, "tags": ["tag1", "tag2"]}`;

  try {
    const result = await getJsonModel().generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (
      typeof parsed.notebook !== "string" ||
      !parsed.notebook.trim() ||
      !Array.isArray(parsed.tags) ||
      !parsed.tags.every((t: unknown) => typeof t === "string")
    ) {
      return fallback;
    }

    return {
      notebook: parsed.notebook.trim(),
      isNew: Boolean(parsed.isNew),
      tags: parsed.tags.map((t: string) => t.toLowerCase().trim()).filter(Boolean),
    };
  } catch {
    return fallback;
  }
}

export interface NoteWithContext {
  topic: string;
  summary: string;
  created_at: string;
  notebookName?: string;
}

export async function answerFromNotes(query: string, notes: NoteWithContext[]): Promise<string> {
  const formatted = notes
    .map((n, i) => {
      const notebook = n.notebookName ? ` in ${n.notebookName}` : "";
      return `[Note ${i + 1}: "${n.topic}"${notebook}] (saved ${n.created_at}):\n${n.summary}`;
    })
    .join("\n\n");

  const prompt = `You are a helpful memory assistant for a Discord team. Answer the question based on the saved notes below.

Rules:
- Write a clear, conversational answer as if you're a knowledgeable team member.
- If multiple notes are relevant, weave them into a coherent narrative.
- Reference which note(s) the information comes from by using the note topic in parentheses.
- If the notes don't contain the answer, say so clearly.
- Be concise. No filler phrases.

Question: "${query}"

Saved notes:
${formatted}

Answer:`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}
