import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Archive, Pencil } from "lucide-react";

type CatalogItem = {
  id: string;
  name: string;
  item_type: string;
  category: string | null;
  status: string;
  platform_rules: Record<string, unknown> | null;
};

type FormState = {
  name: string;
  item_type: string;
  category: string;
  platform_rules: string;
};

const EMPTY_FORM: FormState = { name: "", item_type: "procedure", category: "", platform_rules: "" };

const SUPABASE_URL =
  (import.meta as unknown as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL ||
  "https://oqjupcgtxsbyelaigrxn.supabase.co";
const ANON_KEY =
  (import.meta as unknown as { env?: { VITE_SUPABASE_PUBLISHABLE_KEY?: string } }).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xanVwY2d0eHNieWVsYWlncnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMjQxMzYsImV4cCI6MjA5MTYwMDEzNn0.iThG8ucsnDYBUNFCFDVg2UEL4qCv114tTIBS7-j6mt8";

// Shared raw-fetch helper. Bypasses supabase-js (which was stalling on
// inserts/updates for some users — see commit a79aa54). Hits PostgREST
// directly with AbortController so the request can never hang the UI
// for more than 6s.
async function postgrestRequest(
  path: string,
  init: { method: "POST" | "PATCH"; body: Record<string, unknown> },
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("No active session — please sign in again.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  let resp: Response;
  try {
    resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: init.method,
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error("Request timed out after 6s. Try hard-refreshing the page (Ctrl+Shift+R) and signing in again.");
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    let friendly = `Request failed (HTTP ${resp.status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) friendly = parsed.message;
      else if (parsed?.error) friendly = parsed.error;
    } catch { if (body) friendly = body.slice(0, 200); }
    throw new Error(friendly);
  }
}

export default function MasterCatalog() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = add mode; string = editing the row with this id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: items = [] } = useQuery<CatalogItem[]>({
    queryKey: ["master-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_catalog_items").select("*").order("name");
      if (error) throw error;
      return data as CatalogItem[];
    },
  });

  const { data: clinicItems = [] } = useQuery({
    queryKey: ["clinic-catalog-items"],
    queryFn: async () => {
      const { data } = await supabase.from("clinic_catalog_items").select("master_item_id, clinic_id");
      return data || [];
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (item: CatalogItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      item_type: item.item_type,
      category: item.category ?? "",
      platform_rules:
        item.platform_rules && Object.keys(item.platform_rules).length > 0
          ? JSON.stringify(item.platform_rules, null, 2)
          : "",
    });
    setDialogOpen(true);
  };

  const saveItem = useMutation({
    mutationFn: async () => {
      let rules: Record<string, unknown> = {};
      if (form.platform_rules) {
        try { rules = JSON.parse(form.platform_rules); } catch {
          throw new Error("Platform Rules must be valid JSON");
        }
      }
      const payload = {
        name: form.name,
        item_type: form.item_type,
        category: form.category || null,
        platform_rules: rules,
      };
      if (editingId) {
        await postgrestRequest(`master_catalog_items?id=eq.${editingId}`, { method: "PATCH", body: payload });
      } else {
        await postgrestRequest("master_catalog_items", { method: "POST", body: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["master-catalog"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast.success(editingId ? "Item updated" : "Item added to catalog");
    },
    onError: (err: Error) => {
      toast.error(editingId ? "Failed to update item" : "Failed to add item", { description: err.message });
      qc.invalidateQueries({ queryKey: ["master-catalog"] });
    },
  });

  const deprecate = useMutation({
    mutationFn: async (id: string) => {
      await postgrestRequest(`master_catalog_items?id=eq.${id}`, {
        method: "PATCH",
        body: { status: "deprecated", deprecated_at: new Date().toISOString() },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-catalog"] }); toast.success("Item deprecated"); },
    onError: (err: Error) => toast.error("Failed to deprecate item", { description: err.message }),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      await postgrestRequest(`master_catalog_items?id=eq.${id}`, {
        method: "PATCH",
        body: { status: "active", deprecated_at: null },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-catalog"] }); toast.success("Item reactivated"); },
    onError: (err: Error) => toast.error("Failed to reactivate item", { description: err.message }),
  });

  const clinicCount = (id: string) => clinicItems.filter((ci) => ci.master_item_id === id).length;

  const procedures = items.filter((i) => i.item_type === "procedure");
  const medications = items.filter((i) => i.item_type === "medication");

  const renderTable = (list: CatalogItem[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Clinics</TableHead>
          <TableHead>Rules</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>{item.category || "—"}</TableCell>
            <TableCell>
              <Badge variant={item.status === "active" ? "default" : "destructive"}>{item.status}</Badge>
            </TableCell>
            <TableCell>{clinicCount(item.id)}</TableCell>
            <TableCell className="text-xs max-w-[200px] truncate">
              {item.platform_rules && Object.keys(item.platform_rules).length > 0
                ? JSON.stringify(item.platform_rules)
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(item)} aria-label="Edit item">
                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                </Button>
                {item.status === "active" ? (
                  <Button size="sm" variant="ghost" onClick={() => deprecate.mutate(item.id)}>
                    <Archive className="h-3.5 w-3.5 mr-1" />Deprecate
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => reactivate.mutate(item.id)}>
                    Reactivate
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {list.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No items</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Master Catalog</h1>
          <p className="text-sm text-muted-foreground">Platform-wide procedure and medication catalog</p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />Add Item
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Catalog Item" : "Add Catalog Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.item_type} onValueChange={(v) => setForm((p) => ({ ...p, item_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="procedure">Procedure</SelectItem>
                  <SelectItem value="medication">Medication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Injectables, HRT"
              />
            </div>
            <div>
              <Label>Platform Rules (JSON)</Label>
              <Input
                value={form.platform_rules}
                onChange={(e) => setForm((p) => ({ ...p, platform_rules: e.target.value }))}
                placeholder='{"requires_gfe": true}'
              />
            </div>
            <Button onClick={() => saveItem.mutate()} disabled={!form.name || saveItem.isPending}>
              {saveItem.isPending
                ? (editingId ? "Saving…" : "Adding…")
                : (editingId ? "Save changes" : "Add")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">Total Items</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{items.filter((i) => i.status === "active").length}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{items.filter((i) => i.status === "deprecated").length}</p><p className="text-xs text-muted-foreground">Deprecated</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="procedures">
            <TabsList>
              <TabsTrigger value="procedures">Procedures ({procedures.length})</TabsTrigger>
              <TabsTrigger value="medications">Medications ({medications.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="procedures">{renderTable(procedures)}</TabsContent>
            <TabsContent value="medications">{renderTable(medications)}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
