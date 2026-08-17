import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Package, Search, Edit2, Trash2, Mail, Plus, Upload, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTechStacks, useUserSettings } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { TechStack as TechStackType } from "@/lib/mockData";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TechStackUploadModal from "@/components/modals/TechStackUploadModal";
import ManualTechStackModal from "@/components/modals/ManualTechStackModal";
import EditTechStackModal from "@/components/modals/EditTechStackModal";
import { useToast } from "@/hooks/use-toast";
import { useCVEEngine } from "@/hooks/useCVEEngine";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Email display component with multi-email support
const EmailDisplay = ({ emailList }: { emailList: string }) => {
  const emails = emailList.split(',').map(e => e.trim()).filter(Boolean);
  
  if (emails.length === 0) return <span className="text-sm text-muted-foreground">—</span>;

  if (emails.length <= 2) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="h-4 w-4 flex-shrink-0" />
        <span className="break-all">{emails.join(', ')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Mail className="h-4 w-4 flex-shrink-0" />
      <span className="break-all">{emails.slice(0, 2).join(', ')}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button className="text-xs font-medium text-accent hover:underline whitespace-nowrap">
            +{emails.length - 2} more
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-xs p-3" align="start">
          <p className="text-xs font-medium text-foreground mb-2">All Email IDs</p>
          <div className="space-y-1">
            {emails.map((email, i) => (
              <p key={i} className="text-xs text-muted-foreground">{email}</p>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

const TechStack = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const { triggerEngineBackground } = useCVEEngine();
  const { 
    techStacks, 
    isLoading, 
    addTechStack, 
    updateTechStack, 
    deleteTechStack 
  } = useTechStacks();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [editingStack, setEditingStack] = useState<TechStackType | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const filteredStacks = techStacks.filter(stack => 
    stack.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stack.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stack.productVersion.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stack.organization?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleEdit = (stack: TechStackType) => {
    setEditingStack(stack);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (data: {
    organization: string;
    vendorName: string;
    productName: string;
    productVersion: string;
    emailList: string;
  }) => {
    if (!editingStack) return;

    try {
      await updateTechStack(editingStack.id, {
        org_name: data.organization,
	vendor: data.vendorName,
        product_name: data.productName,
        version: data.productVersion,
        email_list: data.emailList
      });
      
      // Trigger CVE engine in background after update
      triggerEngineBackground();
      
      toast({
        title: "Updated successfully",
        description: "The product information has been updated.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTechStack(id);
      toast({
        title: "Deleted",
        description: "The product has been removed from tech stack.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete",
        variant: "destructive"
      });
    }
  };

  const handleManualAdd = async (data: { organization: string; vendorName: string; productName: string; productVersion: string; emails: string[] }) => {
    if (!user?.email) {
      toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
      return;
    }

    const orgName = user?.user_metadata?.organization || data.organization || 'Default Organization';

    try {
      // email_id = auth email (for RLS), email_list = custom emails or auth email
      const customEmails = data.emails.filter(e => e.trim());
      const emailList = customEmails.length > 0 ? customEmails.join(',') : user.email;
      await addTechStack({
        vendor: data.vendorName,
        product_name: data.productName,
        version: data.productVersion,
        org_name: orgName,
        email_id: user.email,
        email_list: emailList
      });
      
      // Trigger CVE engine in background after adding
      triggerEngineBackground();
      
      toast({
        title: "Product added",
        description: `The product has been added to your tech stack.`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add product",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Tech Stack</h1>
            <p className="text-muted-foreground">
              {techStacks.length} products in your tech stack
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsManualModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Manually
            </Button>
            <Button variant="accent" onClick={() => setIsUploadModalOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by organization, vendor, product, or version..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Email ID
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStacks.map((stack) => (
                  <tr key={stack.id} className="hover:bg-muted/30 transition-colors">
                    {/* Organization */}
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">{stack.organization || '-'}</span>
                    </td>
                    
                    {/* Vendor */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Package className="h-4 w-4 text-accent" />
                        </div>
                        <span className="font-medium">{stack.vendorName}</span>
                      </div>
                    </td>
                    
                    {/* Product Name */}
                    <td className="px-6 py-4">
                      <span>{stack.productName}</span>
                    </td>
                    
                    {/* Version */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                        {stack.productVersion}
                      </span>
                    </td>
                    
                    {/* Email */}
                    <td className="px-6 py-4">
                      <EmailDisplay emailList={stack.emailList || stack.emailId} />
                    </td>
                    
                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(stack)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete product?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove {stack.productName} from your tech stack. 
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDelete(stack.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredStacks.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No products found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Try a different search term' : 'Upload your tech stack to get started'}
              </p>
              {!searchQuery && (
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={() => setIsManualModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Manually
                  </Button>
                  <Button variant="accent" onClick={() => setIsUploadModalOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </Button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <TechStackUploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
      />

      <ManualTechStackModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSubmit={handleManualAdd}
      />

      <EditTechStackModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingStack(null);
        }}
        onSubmit={handleEditSubmit}
        techStack={editingStack}
      />
    </DashboardLayout>
  );
};

export default TechStack;
