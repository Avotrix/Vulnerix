import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { 
  Activity, Search, Filter, Download, Calendar, User,
  FileText, Lock, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuditLog {
  id: string;
  admin_id: string;
  page_affected: string;
  action_performed: string;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
}

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageFilter, setPageFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const { toast } = useToast();

  const pages = [...new Set(logs.map(l => l.page_affected))];

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        setLogs(data || []);
        setFilteredLogs(data || []);
      } catch (error) {
        console.error('Error fetching audit logs:', error);
        toast({
          title: "Error",
          description: "Failed to load audit logs",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  useEffect(() => {
    let filtered = logs;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.action_performed.toLowerCase().includes(query) ||
        l.page_affected.toLowerCase().includes(query) ||
        (l.previous_value && l.previous_value.toLowerCase().includes(query)) ||
        (l.new_value && l.new_value.toLowerCase().includes(query))
      );
    }

    // Page filter
    if (pageFilter !== 'all') {
      filtered = filtered.filter(l => l.page_affected === pageFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let cutoff: Date;

      switch (dateFilter) {
        case 'today':
          cutoff = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          cutoff = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          cutoff = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          cutoff = new Date(0);
      }

      filtered = filtered.filter(l => new Date(l.created_at) >= cutoff);
    }

    setFilteredLogs(filtered);
  }, [searchQuery, pageFilter, dateFilter, logs]);

  const handleExport = (format: 'csv' | 'json') => {
    if (filteredLogs.length === 0) {
      toast({
        title: "No data",
        description: "No logs to export",
        variant: "destructive"
      });
      return;
    }

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'csv') {
      const headers = ['Timestamp', 'Page', 'Action', 'Previous Value', 'New Value', 'Admin ID'];
      const rows = filteredLogs.map(l => [
        new Date(l.created_at).toISOString(),
        l.page_affected,
        l.action_performed,
        l.previous_value || '',
        l.new_value || '',
        l.admin_id
      ]);
      content = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      filename = `audit_logs_${new Date().toISOString()}.csv`;
      mimeType = 'text/csv';
    } else {
      content = JSON.stringify(filteredLogs, null, 2);
      filename = `audit_logs_${new Date().toISOString()}.json`;
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: `Exported ${filteredLogs.length} logs as ${format.toUpperCase()}`
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Audit Logs</h1>
          <p className="text-muted-foreground">Immutable record of all admin actions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Security Notice */}
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-accent" />
            <div>
              <span className="text-sm font-medium text-foreground">Read-Only Audit Trail</span>
              <p className="text-xs text-muted-foreground">
                Audit logs are immutable. DELETE and UPDATE operations are blocked by RLS policies.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <Select value={pageFilter} onValueChange={setPageFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pages</SelectItem>
                {pages.map(page => (
                  <SelectItem key={page} value={page}>{page}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>{filteredLogs.length} entries found</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No audit logs found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log, index) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{log.action_performed}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {log.page_affected}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {expandedLog === log.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  
                  {expandedLog === log.id && (
                    <div className="px-4 pb-4 pt-0 border-t border-border bg-muted/20">
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Previous Value</span>
                          <pre className="text-xs bg-background p-2 rounded border border-border overflow-x-auto">
                            {log.previous_value || '-'}
                          </pre>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">New Value</span>
                          <pre className="text-xs bg-background p-2 rounded border border-border overflow-x-auto">
                            {log.new_value || '-'}
                          </pre>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          Admin ID: {log.admin_id}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogs;
