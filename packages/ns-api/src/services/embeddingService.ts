import { loadConfig } from "../config.js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-lite";
const MAX_INPUT_CHARS = 4000;

interface VoyageResponse {
  data: { embedding: number[] }[];
}

async function callVoyageApi(
  text: string,
  inputType: "document" | "query",
): Promise<number[]> {
  const config = loadConfig();
  const truncated = text.slice(0, MAX_INPUT_CHARS);

  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.voyageApiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [truncated],
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage API error (${response.status}): ${body}`);
  }

  const result = (await response.json()) as VoyageResponse;
  return result.data[0].embedding;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return callVoyageApi(text, "document");
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  return callVoyageApi(text, "query");
}
