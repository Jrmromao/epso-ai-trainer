// Minimal LLM client for an OpenAI-compatible chat completions API (DeepSeek by
// default). Reads config from env — no secrets in code. Server-side only.

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getLlmConfig(): LlmConfig {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? "deepseek-chat";
  if (!baseUrl || !apiKey) {
    throw new Error("LLM not configured: set LLM_BASE_URL and LLM_API_KEY");
  }
  return { baseUrl, apiKey, model };
}

// Calls the chat completions endpoint and returns the raw assistant text.
// Requests JSON output; callers must still validate the shape.
export async function chatJson(
  messages: ChatMessage[],
  config: LlmConfig = getLlmConfig(),
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }
  return content;
}
