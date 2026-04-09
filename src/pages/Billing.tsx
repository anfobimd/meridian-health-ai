import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, FileText, CreditCard } from "lucide-react";
import { format, parseISO } from "date-fns";
import { StatCard } from "@/components/StatCard";

const invoiceStatusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  partial: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  overdue: "bg-destructive/10 text-destructive",
  void: "bg-muted text-muted-foreground",
};

export default function Billing() {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, patients(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, patients(first_name, last_name)")
        .order("paid_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const totalRevenue = payments?.reduce((sum, p: any) => sum + Number(p.amount || 0), 0) ?? 0;
  const outstandingBalance = invoices?.reduce((sum, inv: any) => sum + Number(inv.balance_due || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">Invoices, payments, and revenue tracking</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} />
        <StatCard title="Outstanding" value={`$${outstandingBalance.toLocaleString()}`} icon={FileText} />
        <StatCard title="Payments" value={payments?.length ?? 0} icon={CreditCard} />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices ({invoices?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
          ) : invoices && invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map((inv: any) => (
                <Card key={inv.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{inv.patients?.first_name} {inv.patients?.last_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Total: ${Number(inv.total || 0).toFixed(2)} • Balance: ${Number(inv.balance_due || 0).toFixed(2)}
                        {inv.due_date && ` • Due ${format(parseISO(inv.due_date), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className={invoiceStatusColors[inv.status] ?? ""}>{inv.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">No invoices yet</p></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.patients?.first_name} {p.patients?.last_name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${Number(p.amount).toFixed(2)} via {p.method?.replace("_", " ")}
                        {" • "}{format(parseISO(p.paid_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-success/10 text-success">Paid</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No payments recorded</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
