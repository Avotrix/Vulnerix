import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { 
  Database, Table, Key, Lock, ChevronDown, ChevronRight,
  Hash, Type, Calendar, Link2, Shield
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface TableInfo {
  name: string;
  description: string;
  rowCount: number;
  rlsEnabled: boolean;
  columns: ColumnInfo[];
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

// Static schema definitions (matching actual DB structure)
const tableSchemas: Record<string, { description: string; columns: ColumnInfo[] }> = {
  user_access: {
    description: 'User authentication and access records',
    columns: [
      { name: 'user_id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'user_email_id', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: true, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false }
    ]
  },
  user_settings: {
    description: 'User preferences and notification settings',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'email_id', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'org_name', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'user_id', type: 'UUID', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: true },
      { name: 'notification_level', type: 'TEXT', nullable: true, defaultValue: "'all'", isPrimaryKey: false, isForeignKey: false },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: true, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false }
    ]
  },
  tech_stack: {
    description: 'User-uploaded technology stack inventory',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'vendor', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'product_name', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'version', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'org_name', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'email_id', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: true, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false }
    ]
  },
  tech_stack_results: {
    description: 'CVE and CERT-IN matching results',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'vendor', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'product_name', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'version', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'org_name', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'email_id', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'cve_match', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'severity_cve', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'cert_in', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'severity_cert_in', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: true, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false }
    ]
  },
  user_roles: {
    description: 'Role-based access control assignments',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'user_id', type: 'UUID', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true },
      { name: 'role', type: 'app_role', nullable: false, defaultValue: "'user'", isPrimaryKey: false, isForeignKey: false },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false }
    ]
  },
  admin_audit_logs: {
    description: 'Immutable audit trail for admin actions',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'admin_id', type: 'UUID', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'page_affected', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'action_performed', type: 'TEXT', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'previous_value', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'new_value', type: 'TEXT', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false }
    ]
  },
  admin_settings: {
    description: 'Global system configuration',
    columns: [
      { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true, isForeignKey: false },
      { name: 'settings', type: 'JSONB', nullable: false, defaultValue: "'{}'", isPrimaryKey: false, isForeignKey: false },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false },
      { name: 'updated_by', type: 'UUID', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false }
    ]
  }
};

const DatabaseViewer = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  useEffect(() => {
    const fetchTableInfo = async () => {
      try {
        // Fetch row counts for each table
        const tableNames = Object.keys(tableSchemas);
        const counts: Record<string, number> = {};

        for (const tableName of tableNames) {
          try {
            // user_access uses user_id as primary key, others use id
            const columnToSelect = tableName === 'user_access' ? 'user_id' : 'id';
            const { count, error } = await supabase
              .from(tableName as any)
              .select(columnToSelect, { count: 'exact', head: true });
            
            // Gracefully handle errors (e.g., RLS restrictions)
            counts[tableName] = error ? 0 : (count || 0);
          } catch {
            // Silently handle individual table query failures
            counts[tableName] = 0;
          }
        }

        const tableInfos: TableInfo[] = tableNames.map(name => ({
          name,
          description: tableSchemas[name].description,
          rowCount: counts[name],
          rlsEnabled: true, // All tables have RLS enabled
          columns: tableSchemas[name].columns
        }));

        setTables(tableInfos);
      } catch {
        // Silent failure - no console error in production
      } finally {
        setIsLoading(false);
      }
    };

    fetchTableInfo();
  }, []);

  const getTypeIcon = (type: string) => {
    if (type.includes('UUID')) return <Key className="h-3 w-3" />;
    if (type.includes('TEXT')) return <Type className="h-3 w-3" />;
    if (type.includes('TIMESTAMP')) return <Calendar className="h-3 w-3" />;
    if (type.includes('JSONB')) return <Database className="h-3 w-3" />;
    return <Hash className="h-3 w-3" />;
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
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Database Viewer</h1>
        <p className="text-muted-foreground">Read-only view of database schema and structure</p>
      </div>

      {/* Read-Only Notice */}
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-accent" />
            <div>
              <span className="text-sm font-medium text-foreground">Read-Only Access</span>
              <p className="text-xs text-muted-foreground">
                This viewer provides schema inspection only. No write or delete operations are permitted.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{tables.length}</p>
            <p className="text-xs text-muted-foreground">Tables</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {tables.reduce((sum, t) => sum + t.columns.length, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Columns</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {tables.reduce((sum, t) => sum + t.rowCount, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total Rows</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{tables.length}</p>
            <p className="text-xs text-muted-foreground">RLS Enabled</p>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="space-y-4">
        {tables.map((table, index) => (
          <motion.div
            key={table.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="border-border overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedTable(expandedTable === table.name ? null : table.name)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Table className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">{table.name}</span>
                      {table.rlsEnabled && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Shield className="h-3 w-3" />
                          RLS
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{table.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{table.rowCount} rows</p>
                    <p className="text-xs text-muted-foreground">{table.columns.length} columns</p>
                  </div>
                  {expandedTable === table.name ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {expandedTable === table.name && (
                <div className="border-t border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Column</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nullable</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Default</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Keys</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {table.columns.map((col) => (
                          <tr key={col.name} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {getTypeIcon(col.type)}
                                <span className="font-mono text-sm text-foreground">{col.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="font-mono text-xs">
                                {col.type}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs ${col.nullable ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                                {col.nullable ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-muted-foreground">
                                {col.defaultValue || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {col.isPrimaryKey && (
                                  <Badge className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                                    <Key className="h-3 w-3 mr-1" />
                                    PK
                                  </Badge>
                                )}
                                {col.isForeignKey && (
                                  <Badge className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                                    <Link2 className="h-3 w-3 mr-1" />
                                    FK
                                  </Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default DatabaseViewer;
