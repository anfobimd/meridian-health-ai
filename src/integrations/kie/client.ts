// src/integrations/kie/client.ts
//
// Typed browser-side wrapper around the kie-generate edge function.
//
// The kie.ai API key lives only in Supabase secrets, so every call is proxied:
//   browser -> supabase.functions.invoke("kie-generate") -> api.kie.ai
//
// Generation is asynchronous. Either poll yourself with getKieTask, or use
// waitForKieTask to await the finished asset:
//
//   import { waitForKieTask, createKieTask } from "@/integrations/kie/client";
//   import { KIE_VIDEO_MODELS } from "@/integrations/kie/models";
//
//   const taskId = await createKieTask({
//     model: KIE_VIDEO_MODELS.seedance,
//     input: { prompt: "calm treatment room, soft daylight", aspect_ratio: "16:9" },
//   });
//   const { resultUrls } = await waitForKieTask(taskId);
//
// Result URLs are public CDN links and can be handed straight to a Remotion
// composition — see remotion/compositions/KieClip.tsx.

import { supabase } from "@/integrations/supabase/client";

/** Lifecycle reported by kie.ai. Only "success" and "fail" are terminal. */
export type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export interface KieTask {
  taskId: string;
  state: KieTaskState;
  model: string | null;
  /** Populated once state is "success". Usually one URL, sometimes several. */
  resultUrls: string[];
  /** Populated once state is "fail". */
  error: string | null;
}

export interface CreateKieTaskParams {
  /** See @/integrations/kie/models — any model id kie.ai accepts. */
  model: string;
  /** Model-specific payload (prompt, image_urls, aspect_ratio, ...). */
  input: Record<string, unknown>;
  /** Optional webhook; kie.ai POSTs the finished result here instead of you polling. */
  callBackUrl?: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("kie-generate", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Starts a generation job. Returns immediately with a task id — nothing has rendered yet. */
export async function createKieTask(params: CreateKieTaskParams): Promise<string> {
  const { taskId } = await invoke<{ taskId: string }>({ action: "create", ...params });
  return taskId;
}

/** One-shot status check. */
export function getKieTask(taskId: string): Promise<KieTask> {
  return invoke<KieTask>({ action: "status", taskId });
}

export const isTerminal = (state: KieTaskState) => state === "success" || state === "fail";

export interface WaitForKieTaskOptions {
  /** Gap between polls. Default 5s — generations take tens of seconds to minutes. */
  intervalMs?: number;
  /** Give up after this long. Default 10 minutes. */
  timeoutMs?: number;
  /** Fires on every poll, for progress UI. */
  onPoll?: (task: KieTask) => void;
  signal?: AbortSignal;
}

/**
 * Polls until the task succeeds, fails, or times out.
 * Resolves with the finished task; throws on failure, timeout, or abort.
 */
export async function waitForKieTask(
  taskId: string,
  { intervalMs = 5_000, timeoutMs = 10 * 60_000, onPoll, signal }: WaitForKieTaskOptions = {},
): Promise<KieTask> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw new Error("kie.ai generation aborted");

    const task = await getKieTask(taskId);
    onPoll?.(task);

    if (task.state === "success") return task;
    if (task.state === "fail") throw new Error(task.error ?? "kie.ai generation failed");

    if (Date.now() + intervalMs > deadline) {
      throw new Error(`kie.ai task ${taskId} did not finish within ${Math.round(timeoutMs / 1000)}s`);
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, intervalMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("kie.ai generation aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
