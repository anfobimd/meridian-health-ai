import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, FileText, Eye } from "lucide-react";

function TemplateForm({
  initial,
  onSave,
  saving,
}: {
  initial?: any;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Template Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Botox Follow-up" />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Injectable, Laser, HRT" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" rows={3} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <Label>Active</Label>
      </div>
      <Button
        onClick={() => onSave({ name, description, category, is_active: isActive })}
        disabled={!name.trim() || saving}
        className="w-full"
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {initial ? "Update Template" : "Create Template"}
      </Button>
    </div>
  );
}

export default function TemplateManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["chart-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: previewSections } = useQuery({
    queryKey: ["template-preview", previewId],
    enabled: !!previewId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_template_sections")
        .select("*, chart_template_fields(*)")
        .eq("template_id", previewId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from("chart_templates")
          .update(payload)
          .eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chart_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingTemplate ? "Template updated" : "Template created" });
      qc.invalidateQueries({ queryKey: ["chart-templates"] });
      setDialogOpen(false);
      setEditingTemplate(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chart_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template deleted" });
      qc.invalidateQueries({ queryKey: ["chart-templates"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chart Templates</h1>
          <p className="text-sm text-muted-foreground">Create and manage clinical note templates</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingTemplate(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
            </DialogHeader>
            <TemplateForm
              initial={editingTemplate}
              onSave={(data) => saveMutation.mutate(data)}
              saving={saveMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading templates…
        </div>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="mx-auto h-10 w-10 mb-2" />
            <p>No templates yet. Create your first chart template.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <div className="flex gap-1">
                    <Badge variant={t.is_active ? "default" : "secondary"}>
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {t.is_system && <Badge variant="outline">System</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.category && (
                  <p className="text-xs text-muted-foreground">{t.category}</p>
                )}
                {t.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                  >
                    <Eye className="h-4 w-4 mr-1" /> Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingTemplate(t);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  {!t.is_system && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                {previewId === t.id && previewSections && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Sections</p>
                    {previewSections.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No sections defined</p>
                    ) : (
                      previewSections.map((s: any) => (
                        <div key={s.id} className="rounded border p-2">
                          <p className="text-sm font-medium">{s.title}</p>
                          {s.chart_template_fields?.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {s.chart_template_fields
                                .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
                                .map((f: any) => (
                                  <li key={f.id} className="text-xs text-muted-foreground flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                    {f.label}
                                    <Badge variant="outline" className="text-[11px] h-4 px-1">{f.field_type}</Badge>
                                    {f.is_required && <Badge variant="destructive" className="text-[11px] h-4 px-1">Req</Badge>}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
