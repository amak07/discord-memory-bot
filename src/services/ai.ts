import { GoogleGenerativeAI, TaskType, type GenerativeModel } from "@google/generative-ai";
import type { Note, SavedMessage } from "../types.js";

let genAI: GoogleGenerativeAI;
let model: GenerativeModel;
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

export async function answerFromNotes(query: string, notes: Note[]): Promise<string> {
  const formatted = notes
    .map((n) => `[${n.topic}] (saved ${n.created_at}): ${n.summary}`)
    .join("\n\n");

  const prompt = `You are a helpful memory assistant. Based on these saved notes, answer the question: "${query}". If the notes don't contain the answer, say so. Be concise and direct.

Saved notes:
${formatted}

Answer:`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
