// src/hooks/useQuickTexts.ts
//
// React hook for managing the current user's dotphrase quick texts
// stored in the `provider_quick_texts` table.
//
// Columns: id, user_id, trigger, body, description, is_active,
//          created_at, updated_at

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type QuickText = {
  id: string;
  trigger: string;
  body: string;
  description: string | null;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type CreateQuickTextInput = {
  trigger: string;
  body: string;
  description?: string;
};

export type UpdateQuickTextInput = Partial<
  Pick<QuickText, "trigger" | "body" | "description" | "is_active">
>;

// The generated Supabase types may not yet include `provider_quick_texts`.
// Cast through `unknown` to a narrowly-typed query builder so the rest of
// the hook stays strictly typed without using `any`.
type QuickTextRow = QuickText;
const quickTextsTable = () =>
  (supabase.from as unknown as (
    table: "provider_quick_texts"
  ) => ReturnType<typeof supabase.from<QuickTextRow, QuickTextRow>>)(
    "provider_quick_texts"
  );

export function useQuickTexts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const queryKey = ["quick_texts", userId] as const;

  const {
    data: quickTexts = [],
    isLoading,
    error,
  } = useQuery<QuickText[], Error>({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<QuickText[]> => {
      if (!userId) return [];
      const { data, error: qErr } = await quickTextsTable()
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("trigger", { ascending: true });
      if (qErr) throw new Error(qErr.message);
      return (data ?? []) as QuickText[];
    },
  });

  const lookupTrigger = useCallback(
    (trigger: string): QuickText | null =>
      quickTexts.find((q) => q.trigger === trigger) ?? null,
    [quickTexts]
  );

  const findMatchingTriggers = useCallback(
    (partialTrigger: string): QuickText[] => {
      if (partialTrigger.length < 2) return [];
      return quickTexts.filter((q) => q.trigger.startsWith(partialTrigger));
    },
    [quickTexts]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["quick_texts", userId] });
  }, [queryClient, userId]);

  const createMutation = useMutation<QuickText, Error, CreateQuickTextInput>({
    mutationFn: async (input) => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error: cErr } = await quickTextsTable()
        .insert({
          user_id: userId,
          trigger: input.trigger,
          body: input.body,
          description: input.description ?? null,
          is_active: true,
        })
        .select("*")
        .single();
      if (cErr) throw new Error(cErr.message);
      return data as QuickText;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation<
    QuickText,
    Error,
    { id: string; updates: UpdateQuickTextInput }
  >({
    mutationFn: async ({ id, updates }) => {
      const { data, error: uErr } = await quickTextsTable()
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (uErr) throw new Error(uErr.message);
      return data as QuickText;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error: dErr } = await quickTextsTable().delete().eq("id", id);
      if (dErr) throw new Error(dErr.message);
    },
    onSuccess: invalidate,
  });

  const createQuickText = useCallback(
    (input: CreateQuickTextInput) => createMutation.mutateAsync(input),
    [createMutation]
  );

  const updateQuickText = useCallback(
    (id: string, updates: UpdateQuickTextInput) =>
      updateMutation.mutateAsync({ id, updates }),
    [updateMutation]
  );

  const deleteQuickText = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation]
  );

  return useMemo(
    () => ({
      quickTexts,
      isLoading,
      error: (error as Error | null) ?? null,
      lookupTrigger,
      findMatchingTriggers,
      createQuickText,
      updateQuickText,
      deleteQuickText,
    }),
    [
      quickTexts,
      isLoading,
      error,
      lookupTrigger,
      findMatchingTriggers,
      createQuickText,
      updateQuickText,
      deleteQuickText,
    ]
  );
}