import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Upload, Download, FileSpreadsheet, AlertCircle, 
  CheckCircle, Trash2, Eye, Search, ExternalLink, HelpCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { sampleTemplateData } from "@/lib/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { useTechStacks } from "@/hooks/useSupabaseData";
import { useCVEEngine } from "@/hooks/useCVEEngine";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TechStackUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  organization?: string;
  vendor: string;
  product: string;
  version: string;
  email_to?: string;
}

const TechStackUploadModal = ({ isOpen, onClose }: TechStackUploadModalProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { addMultipleTechStacks } = useTechStacks();
  const { triggerEngineBackground } = useCVEEngine();
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const userOrganization = user?.user_metadata?.organization || 'Default Organization';
  const userEmail = user?.email || '';

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return parsedData;
    const query = searchQuery.toLowerCase();
    return parsedData.filter(
      (row) =>
        row.vendor?.toLowerCase().includes(query) ||
        row.product?.toLowerCase().includes(query)
    );
  }, [parsedData, searchQuery]);

  // Extract a plain string from any cell value (handles ExcelJS rich-text/hyperlink objects)
  const cellToString = (val: any): string => {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    // Hyperlink object: { text, hyperlink }
    if (val.text) return cellToString(val.text);
    // Rich text: { richText: [{text:...}, {text:...}] }
    if (Array.isArray(val.richText)) {
      return val.richText.map((rt: any) => rt.text || '').join('');
    }
    // Formula result
    if (val.result != null) return cellToString(val.result);
    // Hyperlink array
    if (Array.isArray(val)) return val.map(cellToString).join('');
    return String(val);
  };

  // Normalize email field: handle single email or comma-separated list, all spacing variants
  const normalizeEmails = (raw: string): string => {
    if (!raw) return '';
    return raw
      .split(/[,;]/)
      .map(e => e.trim())
      .filter(e => e.length > 0)
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .slice(0, 5) // cap at 5 emails
      .join(',');
  };

  // Case-insensitive header matching
  const findHeader = (headers: string[], candidates: string[]): string | null => {
    for (const h of headers) {
      const normalized = h.trim().toLowerCase();
      if (candidates.includes(normalized)) return h;
    }
    return null;
  };

  const validateAndMapHeaders = (headers: string[]): { vendorKey: string; productKey: string; versionKey: string; emailKey: string | null } | null => {
    const vendorKey = findHeader(headers, ['vendor', 'vendor name', 'vendor_name']);
    const productKey = findHeader(headers, ['product', 'product name', 'product_name']);
    const versionKey = findHeader(headers, ['version', 'product version', 'product_version']);
    const emailKey = findHeader(headers, ['email', 'email_to', 'email_ids', 'email id', 'email_id', 'emails']);
    const organizationKey = findHeader(headers, ['organization', 'org', 'org_name', 'organization name']);

    if (!vendorKey || !productKey || !versionKey) return null;
    return { vendorKey, productKey, versionKey, emailKey, organizationKey };
  };

  const normalizeRow = (row: any, keys: { vendorKey: string; productKey: string; versionKey: string; emailKey: string | null; organizationKey: string | null }): ParsedRow | null => {
    const vendor = cellToString(row[keys.vendorKey]).trim();
    const product = cellToString(row[keys.productKey]).trim();
    const version = cellToString(row[keys.versionKey]).trim();
    const rawEmail = keys.emailKey ? cellToString(row[keys.emailKey]).trim() : '';
    const email = normalizeEmails(rawEmail);
    const organization = keys.organizationKey ? cellToString(row[keys.organizationKey]).trim() : '';
    // Skip invalid rows: vendor, product, version are required
    if (!vendor || !product || !version) return null;
    return { vendor, product, version, email_to: email, organization: organization || undefined };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);
    setSkippedRows(0);

    const extension = selectedFile.name.split('.').pop()?.toLowerCase();

    try {
      let rawData: any[] = [];
      let headers: string[] = [];

      if (extension === 'csv') {
        const text = await selectedFile.text();
        const result = await new Promise<Papa.ParseResult<any>>((resolve) => {
          Papa.parse(text, { header: true, skipEmptyLines: true, complete: resolve });
        });
        headers = result.meta.fields || [];
        rawData = result.data;
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await selectedFile.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet || worksheet.rowCount === 0) {
          setError("Empty spreadsheet");
          return;
        }
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          headers.push(cellToString(cell.value));
        });
        for (let r = 2; r <= worksheet.rowCount; r++) {
          const row = worksheet.getRow(r);
          const obj: any = {};
          headers.forEach((h, idx) => {
            obj[h] = cellToString(row.getCell(idx + 1).value);
          });
          rawData.push(obj);
        }
      } else {
        setError("Unsupported file format. Please upload CSV, XLS, or XLSX file.");
        return;
      }

      const keys = validateAndMapHeaders(headers);
      if (!keys) {
        setError("Invalid file format. Required columns: Vendor, Product, Version (and optionally Email/Email_IDs). Column names are case-insensitive.");
        setParsedData([]);
        return;
      }

      let skipped = 0;
      const normalized: ParsedRow[] = [];
      rawData.forEach((row) => {
        const parsed = normalizeRow(row, keys);
        if (parsed) {
          normalized.push(parsed);
        } else {
          skipped++;
        }
      });

      setSkippedRows(skipped);
      setParsedData(normalized);
    } catch (err) {
      setError("Failed to read file");
    }
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Template");
    ws.columns = [
      { header: "organization", key: "organization", width: 25 },
      { header: "vendor", key: "vendor", width: 20 },
      { header: "product", key: "product", width: 20 },
      { header: "version", key: "version", width: 15 },
      { header: "email_to", key: "email_to", width: 50 },
    ];
    ws.addRow({ organization: "Your Organization", vendor: "Fortinet", product: "FortiOS", version: "7.6.4", email_to: "security@example.com, admin@example.com" });
    ws.addRow({ organization: "Your Organization", vendor: "Adobe", product: "Acrobat", version: "3.1", email_to: "" });


    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tech_stack_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Template downloaded",
      description: "Fill in your tech stack data and upload. Organization will be auto-set from your profile.",
    });
  };

  const handleSubmit = async () => {
    if (parsedData.length === 0) {
      setError("No data to upload");
      return;
    }

    if (!user?.email) {
      setError("You must be logged in to upload");
      return;
    }

    setIsUploading(true);

    try {
      // Always use auth email as email_id for RLS, store provided emails in email_list
      const stacksToInsert = parsedData.map((row) => {
        const rawEmails = row.email_to?.trim();
        const emailList = rawEmails ? rawEmails : userEmail;

        return {
          vendor: row.vendor,
          product_name: row.product,
          version: row.version,
          org_name: row.organization || userOrganization,
          email_id: userEmail,        // Always auth email for RLS
          email_list: emailList        // Full comma-separated list
        };
      });

      await addMultipleTechStacks(stacksToInsert);
      triggerEngineBackground();

      toast({
        title: "Upload successful",
        description: `${stacksToInsert.length} entries added to tech stack. CVE scanning started.`,
      });

      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to upload data");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setError(null);
    setSearchQuery("");
    setSkippedRows(0);
    onClose();
  };

  const handleRemoveRow = (index: number) => {
    setParsedData(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Upload className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">Upload Tech Stack</h2>
                <p className="text-sm text-muted-foreground">Import your technology inventory</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* NVD CPE Directory Instruction */}
            <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
              <p className="text-sm text-foreground">
                <strong>Before filling your sheet:</strong> Please find the correct Vendor and Product from the official NVD CPE directory and enter the exact values.
              </p>
              <a 
                href="https://nvd.nist.gov/products/cpe/search" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline mt-2"
              >
                Open NVD CPE Search <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* CPE Structure Help */}
            <div className="flex items-start gap-2 p-4 rounded-xl bg-muted/50 border border-border">
              <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">CPE Structure Reference:</p>
                <code className="block text-xs bg-background p-2 rounded border border-border mb-2 break-all">
                  cpe:2.3:type:vendor:product:version
                </code>
                <p className="text-xs">
                  <strong>Example:</strong>{' '}
                  <code className="bg-background px-1 py-0.5 rounded">cpe:2.3:a:google:chrome:9.0.597.7</code>
                </p>
              </div>
            </div>

            {/* Download Template */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm text-foreground">Need the template?</p>
                  <p className="text-xs text-muted-foreground">Download our sample Excel template with correct columns</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>

            {/* Upload Area */}
            <div 
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                file ? 'border-accent bg-accent/5' : 'border-border hover:border-muted-foreground'
              }`}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <CheckCircle className="h-6 w-6 text-accent" />
                  <span className="font-medium text-foreground">{file.name}</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setParsedData([]);
                      setSkippedRows(0);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium mb-1 text-foreground">Drop your file here or click to browse</p>
                  <p className="text-sm text-muted-foreground">Supports CSV, XLS, and XLSX files</p>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Skipped rows warning */}
            {skippedRows > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/30 text-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p className="text-sm">{skippedRows} row(s) skipped due to missing vendor, product, or version.</p>
              </div>
            )}

            {/* Preview */}
            {parsedData.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Preview ({filteredData.length} of {parsedData.length} rows)
                    </span>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search vendor or product..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 bg-background border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="w-[40px] px-3 py-3 text-left font-medium text-foreground">#</th>
                          <th className="w-[22%] px-3 py-3 text-left font-medium text-foreground">Vendor</th>
                          <th className="w-[22%] px-3 py-3 text-left font-medium text-foreground">Product</th>
                          <th className="w-[14%] px-3 py-3 text-left font-medium text-foreground">Version</th>
                          <th className="w-[30%] px-3 py-3 text-left font-medium text-foreground">Email(s)</th>
                          <th className="w-[40px] px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredData.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-3 text-foreground">{i + 1}</td>
                            <td className="px-3 py-3 text-foreground truncate">{row.vendor}</td>
                            <td className="px-3 py-3 text-foreground truncate">{row.product}</td>
                            <td className="px-3 py-3 font-mono text-xs text-foreground">{row.version}</td>
                            <td className="px-3 py-3 text-muted-foreground text-xs break-all">
                              {row.email_to || <span className="italic">Using: {userEmail}</span>}
                            </td>
                            <td className="px-3 py-3">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7"
                                onClick={() => handleRemoveRow(parsedData.indexOf(row))}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {filteredData.length === 0 && searchQuery && (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                              No results found for "{searchQuery}"
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {filteredData.length > 5 && (
                    <div className="px-4 py-2 bg-muted/30 text-center text-xs text-muted-foreground">
                      And {filteredData.length - 5} more rows...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              variant="accent" 
              onClick={handleSubmit}
              disabled={parsedData.length === 0 || isUploading}
            >
              {isUploading ? 'Uploading...' : `Upload ${parsedData.length} Products`}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TechStackUploadModal;
