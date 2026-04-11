import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Archive } from "lucide-react";

export default function MasterCatalog() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", item_type: "procedure", category: "", platform_rules: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["master-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_catalog_items").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clinicItems = [] } = useQuery({
    queryKey: ["clinic-catalog-items"],
    queryFn: async () => {
      const { data } = await supabase.from("clinic_catalog_items").select("master_item_id, clinic_id");
      return data || [];
    },
  });

  const addItem = useMutation({
    mutationFn: async () => {
      let rules = {};
      if (form.platform_rules) { try { rules = JSON.parse(form.platform_rules); } catch {} }
      const { error } = await supabase.from("master_catalog_items").insert({
        name: form.name,
        item_type: form.item_type,
        category: form.category || null,
        platform_rules: rules,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-catalog"] }); setAddOpen(false); setForm({ name: "", item_type: "procedure", category: "", platform_rules: "" }); toast.success("Item added to catalog"); },
  });

  const deprecate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("master_catalog_items").update({ status: "deprecated", deprecated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-catalog"] }); toast.success("Item deprecated"); },
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("master_catalog_items").update({ status: "active", deprecated_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-catalog"] }); toast.success("Item reactivated"); },
  });

  const clinicCount = (id: string) => clinicItems.filter(ci => ci.master_item_id === id).length;

  const procedures = items.filter(i => i.item_type === "procedure");
  const medications = items.filter(i => i.item_type === "medication");

  const renderTable = (list: typeof items) => (
    <Table>
      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Clinics</TableHead><TableHead>Rules</TableHead><TableHead></TableHead></TableRow></TableHeader>
      <TableBody>
        {list.map(item => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>{item.category || "—"}</TableCell>
            <TableCell><Badge variant={item.status === "active" ? "default" : "destructive"}>{item.status}</Badge></TableCell>
            <TableCell>{clinicCount(item.id)}</TableCell>
            <TableCell className="text-xs max-w-[200px] truncate">{item.platform_rules && Object.keys(item.platform_rules as object).length > 0 ? JSON.stringify(item.platform_rules) : "—"}</TableCell>
            <TableCell>
              {item.status === "active" ? (
                <Button size="sm" variant="ghost" onClick={() => deprecate.mutate(item.id)}><Archive className="h-3.5 w-3.5 mr-1" />Deprecate</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => reactivate.mutate(item.id)}>Reactivate</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
        {list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No items</TableCell></TableRow>}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Platform" }, { label: "Master Catalog" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Master Catalog</h1>
          <p className="text-sm text-muted-foreground">Platform-wide procedure and medication catalog</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Item</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Catalog Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div>
                <Label>Type</Label>
                <Select value={form.item_type} onValueChange={v => setForm(p => ({ ...p, item_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="procedure">Procedure</SelectItem><SelectItem value="medication">Medication</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label><Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Injectables, HRT" /></div>
              <div><Label>Platform Rules (JSON)</Label><Input value={form.platform_rules} onChange={e => setForm(p => ({ ...p, platform_rules: e.target.value }))} placeholder='{"requires_gfe": true}' /></div>
              <Button onClick={() => addItem.mutate()} disabled={!form.name}>Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">Total Items</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{items.filter(i => i.status === "active").length}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{items.filter(i => i.status === "deprecated").length}</p><p className="text-xs text-muted-foreground">Deprecated</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="procedures">
            <TabsList><TabsTrigger value="procedures">Procedures ({procedures.length})</TabsTrigger><TabsTrigger value="medications">Medications ({medications.length})</TabsTrigger></TabsList>
            <TabsContent value="procedures">{renderTable(procedures)}</TabsContent>
            <TabsContent value="medications">{renderTable(medications)}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
