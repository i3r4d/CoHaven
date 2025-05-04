import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusIcon,
  FileTextIcon,
  DownloadIcon,
  Trash2Icon,
  SearchIcon,
  FileIcon,
  ImageIcon,
  FileSpreadsheetIcon,
  PresentationIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useProperty } from "@/contexts/PropertyContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from '@/integrations/supabase/types';

type Document = Database['public']['Tables']['documents']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface DocumentWithUploader extends Document {
  uploader?: Profile;
}

const BUCKET_NAME = 'property-documents';

const DocumentList = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedProperty } = useProperty();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentWithUploader[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    file: null as File | null,
  });
  
  useEffect(() => {
    const fetchDocuments = async () => {
      if (!selectedProperty) {
        setDocuments([]);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('property_id', selectedProperty.id)
          .order('uploaded_at', { ascending: false });
          
        if (error) throw error;
        
        const userIds = Array.from(new Set(
          data?.map(doc => doc.uploaded_by).filter(Boolean) as string[]
        ));
        
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);
            
          if (profilesError) throw profilesError;
          
          const profilesMap: Record<string, Profile> = {};
          profilesData?.forEach(profile => {
            profilesMap[profile.id] = profile;
          });
          
          setProfiles(profilesMap);
          
          const docsWithProfiles = data?.map(doc => ({
            ...doc,
            uploader: doc.uploaded_by ? profilesMap[doc.uploaded_by] : undefined
          }));
          
          setDocuments(docsWithProfiles || []);
        } else {
          setDocuments(data || []);
        }
      } catch (error: any) {
        console.error("Error fetching documents:", error);
        toast({
          title: "Error",
          description: "Failed to load documents",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDocuments();
  }, [selectedProperty]);
  
  useEffect(() => {
    if (!isDialogOpen) {
      setFormData({
        name: "",
        description: "",
        file: null,
      });
    }
  }, [isDialogOpen]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData(prev => ({
        ...prev,
        name: prev.name || file.name,
        file
      }));
    }
  };
  
  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <ImageIcon className="h-6 w-6" />;
    } else if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv')) {
      return <FileSpreadsheetIcon className="h-6 w-6" />;
    } else if (fileType.includes('presentation') || fileType.includes('powerpoint')) {
      return <PresentationIcon className="h-6 w-6" />;
    } else if (fileType.includes('pdf') || fileType.includes('text')) {
      return <FileTextIcon className="h-6 w-6" />;
    } else {
      return <FileIcon className="h-6 w-6" />;
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };
  
  const getUserName = (userId?: string | null) => {
    if (!userId) return "Unknown";
    
    const profile = profiles[userId];
    if (profile) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    
    if (userId === user?.id) {
      return "You";
    }
    
    return "Unknown User";
  };
  
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProperty || !user || !formData.file) {
      toast({
        title: "Error",
        description: "Missing required information",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      const file = formData.file;
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedProperty.id}/${Date.now()}-${file.name}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);
        
      if (uploadError) throw uploadError;
      
      const documentData = {
        property_id: selectedProperty.id,
        name: formData.name || file.name,
        description: formData.description || null,
        file_path: fileName,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id
      };
      
      const { data: documentRecord, error: documentError } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single();
        
      if (documentError) throw documentError;
      
      if (documentRecord) {
        const newDocument = {
          ...documentRecord,
          uploader: user ? profiles[user.id] : undefined
        };
        
        setDocuments([newDocument, ...documents]);
      }
      
      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: `Failed to upload document: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDownloadDocument = async (doc: DocumentWithUploader) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(doc.file_path);
        
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      
      // Create an anchor element to trigger download
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.name;
      window.document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Document downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to download document: ${error.message}`,
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteDocument = async (document: DocumentWithUploader) => {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }
    
    try {
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id);
        
      if (dbError) throw dbError;
      
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([document.file_path]);
        
      if (storageError) {
        console.error("Storage removal error:", storageError);
      }
      
      setDocuments(documents.filter(d => d.id !== document.id));
      
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to delete document: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  if (!selectedProperty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-xl font-serif font-medium mb-2">
            No Property Selected
          </h3>
          <p className="text-muted-foreground mb-6">
            Please select or create a property to manage documents
          </p>
          <Button 
            onClick={() => window.location.href = "/properties"}
            className="bg-navy-900 hover:bg-navy-800"
          >
            Go to Properties
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-serif font-bold text-navy-900">Documents</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-navy-900 hover:bg-navy-800">
              <PlusIcon className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="font-serif">Upload Document</DialogTitle>
              <DialogDescription>
                Add a new document to {selectedProperty.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUploadDocument}>
              <div className="grid gap-6 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="file">Select File</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={handleFileChange}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Max file size: 10MB
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Document Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Insurance Policy"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use filename
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Briefly describe this document"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-navy-900 hover:bg-navy-800"
                  disabled={isUploading || !formData.file}
                >
                  {isUploading ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Property Documents</CardTitle>
          <CardDescription>
            View and manage documents for {selectedProperty.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="border rounded-lg p-4 animate-pulse">
                  <div className="flex items-center mb-3">
                    <div className="h-10 w-10 bg-gray-200 rounded mr-3"></div>
                    <div className="flex-1">
                      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="flex justify-end">
                    <div className="h-8 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredDocuments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((document) => (
                <div key={document.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center mb-3">
                    <div className="h-10 w-10 flex items-center justify-center bg-navy-100 rounded mr-3 text-navy-700">
                      {getFileIcon(document.file_type)}
                    </div>
                    <div>
                      <h3 className="font-medium line-clamp-1">{document.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(document.file_size)} • {document.file_type.split('/')[1]}
                      </p>
                    </div>
                  </div>
                  
                  {document.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {document.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>
                      {format(new Date(document.uploaded_at), "MMM d, yyyy")}
                    </span>
                    <span>
                      By {getUserName(document.uploaded_by)}
                    </span>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => handleDownloadDocument(document)}
                    >
                      <DownloadIcon className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteDocument(document)}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery 
                ? "No documents match your search." 
                : "No documents found. Click \"Upload Document\" to add your first document."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentList;
