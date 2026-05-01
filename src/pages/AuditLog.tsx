import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield } from "lucide-react";

type AuditAction = "create" | "update" | "delete" | "login";

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string;
  action: AuditAction;
  resource_type: string;
  details: string;
  ip_address: string;
}

const ACTION_COLORS: Record<AuditAction, string> = {
  create: "bg-success/10 text-success",
  update: "bg-info/10 text-info",
  delete: "bg-destructive/10 text-destructive",
  login: "bg-gray-100 text-muted-foreground",
};

// Radix's Select requires non-empty string values for items, so we use a
// sentinel ("all") instead of "" to mean no action-type filter.
const ACTION_ALL = "all";

export function AuditLog() {
  const [actionFilter, setActionFilter] = useState<string>(ACTION_ALL);
  const [userFilter, setUserFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [displayLimit, setDisplayLimit] = useState(50);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((log: any) => {
      if (actionFilter !== ACTION_ALL && log.action !== actionFilter) return false;
      if (userFilter && !log.user_email?.toLowerCase().includes(userFilter.toLowerCase())) return false;
      if (startDate) {
        const logDate = new Date(log.created_at);
        if (logDate < new Date(startDate)) return false;
      }
      if (endDate) {
        const logDate = new Date(log.created_at);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (logDate > end) return false;
      }
      return true;
    });
  }, [logs, actionFilter, userFilter, startDate, endDate]);

  const displayedLogs = filteredLogs.slice(0, displayLimit);
  const hasMore = filteredLogs.length > displayLimit;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const truncateDetails = (text: string, maxLength = 50) => {
    return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
  };

  return (
    <div className="space-y-6">
<Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <div>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>HIPAA-compliant activity trail</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="action-filter">Action Type</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger id="action-filter">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACTION_ALL}>All Actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-filter">User</Label>
              <Input
                id="user-filter"
                placeholder="Search by email"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No audit logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {formatDate(log.created_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.user_email || "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge className={ACTION_COLORS[log.action as AuditAction]}>
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.resource_type || "N/A"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <span title={log.details}>
                              {truncateDetails(log.details || "")}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {log.ip_address || "N/A"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDisplayLimit((prev) => prev + 50)}
                  >
                    Load More ({filteredLogs.length - displayLimit} remaining)
                  </Button>
                </div>
              )}

              <div className="text-xs text-muted-foreground pt-2">
                Showing {displayedLogs.length} of {filteredLogs.length} logs
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
