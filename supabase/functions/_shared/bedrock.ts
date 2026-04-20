// _shared/bedrock.ts
//
// Anthropic-via-Bedrock client for Supabase Edge Functions.
// Exposes an OpenAI-compatible `chatCompletion()` so the 24 existing AI
// functions can swap their Lovable-gateway fetch for one call here with
// minimal changes.
//
// Configure via Supabase secrets:
//   AWS_ACCESS_KEY_ID       (required)
//   AWS_SECRET_ACCESS_KEY   (required)
//   AWS_REGION              (default: us-west-2)
//   BEDROCK_MODEL_ID        (default: us.anthropic.claude-sonnet-4-6)
//
// Uses aws4fetch for SigV4 signing — pure-fetch, works in Deno.

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

// ─── Types: OpenAI-compatible request/response ──────────────────────────────
export type OAIRole = "system" | "user" | "assistant" | "tool";

export interface OAIMessage {
  role: OAIRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface OAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  messages: OAIMessage[];
  tools?: OAITool[];
  tool_choice?: { type: "function"; function: { name: string } } | "auto" | "none";
  max_tokens?: number;
  temperature?: number;
  model?: string; // override BEDROCK_MODEL_ID
}

export interface ChatCompletionResponse {
  choices: Array<{
    index: 0;
    finish_reason: string;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

// ─── Anthropic native types ─────────────────────────────────────────────────
type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicRequest {
  anthropic_version: "bedrock-2023-05-31";
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: AnthropicContent[] | string }>;
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  temperature?: number;
}

interface AnthropicResponse {
  id: string;
  model: string;
  content: AnthropicContent[];
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
}

// ─── Core invocation ────────────────────────────────────────────────────────
let _awsClient: AwsClient | null = null;

function getAwsClient(): AwsClient {
  if (_awsClient) return _awsClient;
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set for Bedrock");
  }
  _awsClient = new AwsClient({ accessKeyId, secretAccessKey, service: "bedrock" });
  return _awsClient;
}

/**
 * Call Bedrock (Anthropic) with an OpenAI-compatible payload.
 * Handles translation in both directions.
 */
export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const region = Deno.env.get("AWS_REGION") || "us-west-2";
  const modelId = req.model || Deno.env.get("BEDROCK_MODEL_ID") || "us.anthropic.claude-sonnet-4-6";

  // Translate OpenAI → Anthropic
  const anthReq: AnthropicRequest = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: req.max_tokens ?? 4096,
    messages: [],
  };
  if (req.temperature !== undefined) anthReq.temperature = req.temperature;

  // Combine consecutive system messages into the top-level `system` field
  const systemParts: string[] = [];
  for (const m of req.messages) {
    if (m.role === "system" && typeof m.content === "string") {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      // tool result — append to the last user message as a tool_result block
      anthReq.messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id || "", content: m.content || "" }],
      });
      continue;
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      anthReq.messages.push({
        role: "assistant",
        content: [
          ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
          ...m.tool_calls.map((tc) => ({
            type: "tool_use" as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || "{}"),
          })),
        ],
      });
      continue;
    }
    // plain user / assistant text message
    anthReq.messages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : "",
    });
  }
  if (systemParts.length) anthReq.system = systemParts.join("\n\n");

  if (req.tools?.length) {
    anthReq.tools = req.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
    if (req.tool_choice === "auto") anthReq.tool_choice = { type: "auto" };
    else if (req.tool_choice && typeof req.tool_choice === "object")
      anthReq.tool_choice = { type: "tool", name: req.tool_choice.function.name };
  }

  // SigV4-sign and send
  const aws = getAwsClient();
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  const res = await aws.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(anthReq),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Bedrock [${res.status}]: ${txt}`);
  }
  const anthRes: AnthropicResponse = await res.json();

  // Translate Anthropic → OpenAI
  let textContent = "";
  const toolCalls: NonNullable<ChatCompletionResponse["choices"][0]["message"]["tool_calls"]> = [];
  for (const block of anthRes.content) {
    if (block.type === "text") textContent += block.text;
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }

  return {
    choices: [
      {
        index: 0,
        finish_reason: mapStopReason(anthRes.stop_reason),
        message: {
          role: "assistant",
          content: textContent || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
      },
    ],
    usage: anthRes.usage
      ? {
          prompt_tokens: anthRes.usage.input_tokens,
          completion_tokens: anthRes.usage.output_tokens,
          total_tokens: anthRes.usage.input_tokens + anthRes.usage.output_tokens,
        }
      : undefined,
    model: anthRes.model,
  };
}

function mapStopReason(reason: string): string {
  switch (reason) {
    case "end_turn": return "stop";
    case "max_tokens": return "length";
    case "tool_use": return "tool_calls";
    case "stop_sequence": return "stop";
    default: return reason;
  }
}
