// src/hooks/useKieGeneration.ts
//
// React hook for kie.ai generation via the kie-generate edge function.
// Fires the job, polls until it finishes, and surfaces live progress.
//
// Usage:
//   const { generate, state, resultUrls } = useKieGeneration();
//
//   const urls = await generate.mutateAsync({
//     model: KIE_VIDEO_MODELS.seedance,
//     input: { prompt: "sunrise over a coastal clinic", aspect_ratio: "16:9" },
//   });
//
// Generations run for tens of seconds to several minutes, so `state` is the
// value to drive a progress indicator off — `generate.isPending` stays true for
// the whole wait.

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreateKieTaskParams,
  KieTaskState,
  createKieTask,
  waitForKieTask,
} from "@/integrations/kie/client";

export interface UseKieGenerationOptions {
  /** Give up after this long. Default 10 minutes. */
  timeoutMs?: number;
  /** Set false to handle errors/success entirely in the caller. Default true. */
  showToasts?: boolean;
}

export function useKieGeneration({ timeoutMs, showToasts = true }: UseKieGenerationOptions = {}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [state, setState] = useState<KieTaskState | null>(null);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useMutation({
    mutationFn: async (params: CreateKieTaskParams): Promise<string[]> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setResultUrls([]);
      setState("waiting");

      const id = await createKieTask(params);
      setTaskId(id);

      const task = await waitForKieTask(id, {
        timeoutMs,
        signal: controller.signal,
        onPoll: (t) => setState(t.state),
      });

      setResultUrls(task.resultUrls);
      return task.resultUrls;
    },
    onSuccess: (urls) => {
      if (!showToasts) return;
      toast.success(urls.length === 1 ? "Generation ready" : `${urls.length} assets ready`);
    },
    onError: (e: Error) => {
      setState("fail");
      if (!showToasts) return;
      if (e.message?.includes("not configured")) {
        toast.error("kie.ai is not configured — set the KIE_API_KEY secret.");
      } else if (e.message?.includes("did not finish")) {
        toast.error("Generation timed out. The job may still finish — check the task id.");
      } else {
        toast.error(e.message || "Generation failed");
      }
    },
  });

  /** Stops polling. The kie.ai job itself keeps running and still bills. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { generate, cancel, taskId, state, resultUrls };
}
