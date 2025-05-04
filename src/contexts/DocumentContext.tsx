// src/contexts/DocumentContext.tsx
// Corrected: Removed 'Constants' import, derived static categories from enum, defined local bucket name.
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useProperty } from './PropertyContext';
import { useToast } from '@/hooks/use-toast';
// Corrected Import: Removed Constants
import {
  DocumentContextType,
  Document, // Keep Document type for enriched data
  DocumentFolder,
  StaticDocumentCategory, // Keep for context value type hint if needed, but will derive from DocumentCategory
  Profile,
  DocumentUploadPayload,
  FolderFormData,
  DbResult,
  TablesInsert,
  TablesUpdate,
  DocumentRow, // Keep DocumentRow for DB results before enrichment
  DocumentCategory, // Import the actual Enum
} from '@/integrations/supabase/types';
import { formatISO, parseISO, isValid as isValidDate } from 'date-fns'; // Added isValidDate

// Helper function to sanitize filenames (Unchanged)
const sanitizeFilename = (filename: string): string => {
  const name = filename.substring(0, filename.lastIndexOf('.')) || filename;
  const extension = filename.substring(filename.lastIndexOf('.'));
  let sanitized = name.replace(/[^a-zA-Z0-9_.\-]/g, '_').replace(/^[_.\-]+|[_.\-]+$/g, '');
  if (!sanitized) {
      sanitized = `file_${Date.now()}`;
  }
  return sanitized + extension;
};

// Define Supabase bucket name locally
const DOCUMENTS_BUCKET = 'property-documents';

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

// Derive static categories array from the DocumentCategory enum
// Assuming StaticDocumentCategory is essentially { id: DocumentCategory, name: string }
// Adjust this derivation if StaticDocumentCategory has a different structure
const staticDocumentCategories: StaticDocumentCategory[] = Object.values(DocumentCategory).map(categoryValue => ({
    id: categoryValue,
    // Format the enum value for display (e.g., 'legal' -> 'Legal')
    name: categoryValue.charAt(0).toUpperCase() + categoryValue.slice(1).replace(/_/g, ' '),
}));


// --- Provider Definition ---
export function DocumentProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const { selectedProperty } = useProperty();
  const { toast } = useToast();

  // State (Unchanged)
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [currentFolderId, setCurrentFolderIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // --- Data Fetching Callbacks ---

  // fetchAllFoldersForProperty (Unchanged from user provided)
  const fetchAllFoldersForProperty = useCallback(async (): Promise<DocumentFolder[]> => {
     const propertyId = selectedProperty?.id;
    if (!propertyId) { setFolders([]); return []; }
    console.log('DocumentContext: Fetching ALL folders for property:', propertyId);
     setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('document_folders')
        .select('*')
        .eq('property_id', propertyId)
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      const fetchedFolders = data || [];
      setFolders(fetchedFolders);
      console.log(`DocumentContext: Successfully fetched ${fetchedFolders.length} folders for ${propertyId}.`);
      return fetchedFolders;
    } catch (err: any) {
      console.error('DocumentContext: Error fetching all folders:', err); setError(err); setFolders([]);
      toast({ title: "Error", description: "Could not load document folders.", variant: "destructive" });
      return [];
    }
  }, [selectedProperty?.id, toast, supabase]);

  // fetchDocumentsData (Unchanged from user provided)
  const fetchDocumentsData = useCallback(async (folderIdToFetch: string | null) => {
    const propertyId = selectedProperty?.id;
    if (!propertyId || !session) {
      setDocuments([]); setIsLoading(false); return;
    }
    console.log(`DocumentContext: Fetching documents for property ${propertyId}, folder: ${folderIdToFetch ?? 'root'}`);
    setIsLoading(true); setError(null);

    try {
      const selectQuery = `*, folder:document_folders(id, name), linked_expense:expenses(id, description, amount, date)`;
      let query = supabase.from('documents').select(selectQuery).eq('property_id', propertyId);
      query = folderIdToFetch === null ? query.is('folder_id', null) : query.eq('folder_id', folderIdToFetch);
      query = query.order('name', { ascending: true });
      const { data: rawDocsData, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      const fetchedDocs = (rawDocsData || []) as DocumentRow[];

      const uploaderIds = [...new Set(fetchedDocs.map((doc) => doc.uploaded_by).filter(Boolean))] as string[];
      let profileMap = new Map<string, Profile>();
      if (uploaderIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('*').in('id', uploaderIds);
        if (profilesError) { console.error("DocContext: Error fetching profiles:", profilesError); }
        else { (profilesData || []).forEach(p => profileMap.set(p.id, p)); }
      }

      const enrichedDocuments: Document[] = fetchedDocs.map((doc) => {
        const profile = doc.uploaded_by ? profileMap.get(doc.uploaded_by) : null;
        const folderData = doc.folder as unknown as DocumentFolder | null;
        const expenseData = doc.linked_expense as unknown as { id: string, description: string, amount: number, date: string } | null;

        return {
          ...doc,
          // Parse expiration date string into Date object or keep as null
          expires_at: doc.expires_at && isValidDate(parseISO(doc.expires_at)) ? parseISO(doc.expires_at) : null,
          uploaded_by_profile: profile ? { id: profile.id, first_name: profile.first_name, last_name: profile.last_name, avatar_url: profile.avatar_url, email: profile.email } : null,
          folder: folderData ? { id: folderData.id, name: folderData.name } : null,
          linked_expense: expenseData ? { id: expenseData.id, description: expenseData.description, amount: expenseData.amount, date: expenseData.date } : null,
          // category needs to be mapped from category_id if needed, or ensure category_id exists on Document type
          // category: mapCategoryIdToEnum(doc.category_id), // Example mapping
        };
      });

      setDocuments(enrichedDocuments);
      console.log(`DocumentContext: Successfully fetched and enriched ${enrichedDocuments.length} documents for folder ${folderIdToFetch ?? 'root'}.`);

    } catch (err: any) {
      console.error('DocumentContext: Error fetching documents:', err); setError(err); setDocuments([]);
      if (err && typeof err === 'object' && 'message' in err) { toast({ title: "Error Loading Documents", description: err.message || "Unexpected error.", variant: "destructive" }); }
      else { toast({ title: "Error Loading Documents", description: "Unexpected error.", variant: "destructive" }); }
    } finally { setIsLoading(false); }
  }, [selectedProperty?.id, session, toast, supabase]);


  // --- Effects --- (Unchanged from user provided)
  useEffect(() => { /* Effect 1: Fetch Folders */
      const propertyId = selectedProperty?.id;
      if (propertyId && session) {
          console.log("DocumentContext: Effect 1 (Property Change) - Fetching Folders for", propertyId);
          fetchAllFoldersForProperty().catch((e) => { console.error("DocumentContext: Error in Effect 1:", e); });
      } else { setFolders([]); }
  }, [selectedProperty?.id, session, fetchAllFoldersForProperty]);

  useEffect(() => { /* Effect 2: Reset to Root */
      const propertyId = selectedProperty?.id;
      if (propertyId && session) {
          console.log("DocumentContext: Effect 2 (Property Change) - Resetting to root folder for", propertyId);
           if (currentFolderId !== null) {
                setCurrentFolderIdState(null);
           } else {
                fetchDocumentsData(null);
           }
      } else {
          setDocuments([]); setCurrentFolderIdState(null);
      }
  }, [selectedProperty?.id, session]); // fetchDocumentsData removed intentionally as per user code

  useEffect(() => { /* Effect 3: Fetch Docs on Folder Change */
      const propertyId = selectedProperty?.id;
      if (propertyId && session) {
          console.log("DocumentContext: Effect 3 (Folder Change) - Fetching documents for folder:", currentFolderId ?? 'root');
          fetchDocumentsData(currentFolderId);
      } else { setDocuments([]); }
  }, [currentFolderId, selectedProperty?.id, session, fetchDocumentsData]);


  // --- State Update Logic --- (Unchanged from user provided)
  const setCurrentFolderId = useCallback((folderId: string | null) => {
    setCurrentFolderIdState(folderId);
  }, []);

  // --- CRUD Actions ---

  // uploadDocument (Corrected storage bucket usage)
  const uploadDocument = useCallback(async (payload: DocumentUploadPayload): Promise<DbResult<DocumentRow>> => {
    console.log('uploadDocument called with payload:', payload);
    const propertyId = selectedProperty?.id;
    const userId = user?.id;
    if (!propertyId || !userId) { const msg = "Property or user not available."; return { data: null, error: new Error(msg) }; }
    if (!payload.file) { const msg = "No file provided."; return { data: null, error: new Error(msg) }; }

    setIsUploading(true); setUploadProgress(0);
    const file = payload.file;
    const sanitizedName = sanitizeFilename(file.name);
    const folderPathSegment = payload.folder_id ? `${payload.folder_id}/` : 'root/';
    // Consider removing userId from filename if RLS/policies handle ownership
    const uniqueFileName = `${Date.now()}_${sanitizedName}`;
    const filePath = `${propertyId}/${folderPathSegment}${uniqueFileName}`;
    console.log('DocumentContext: Uploading to path:', filePath);

    try {
      setUploadProgress(30);
      await new Promise(res => setTimeout(res, 300));
      // Corrected: Use local constant for bucket name
      const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(filePath, file, { cacheControl: '3600', upsert: false });
      setUploadProgress(70);
      if (storageError) { throw new Error(storageError.message || "Storage upload failed."); }
      console.log('DocumentContext: Storage upload successful.'); setUploadProgress(100);

      // Use DocumentCategory type for category
      const documentData: TablesInsert<'documents'> = {
        property_id: propertyId,
        uploaded_by: userId,
        name: payload.name,
        description: payload.description,
        storage_path: filePath, // Use storage_path instead of file_path if that's the DB column name
        file_size: file.size,
        file_type: file.type,
        folder_id: payload.folder_id,
        category: payload.category, // Use category directly (matching enum type)
        expires_at: payload.expires_at ? formatISO(payload.expires_at) : null, // Use expires_at to match type
        linked_expense_id: payload.linked_expense_id,
      };
      console.log('DocumentContext: Inserting document data:', documentData);

      const { data: insertedDoc, error: dbError } = await supabase.from('documents').insert(documentData).select().single();
      if (dbError) {
        console.error('DocumentContext: Database insert error:', dbError);
        console.log(`DocumentContext: Attempting delete orphan: ${filePath}`);
        // Corrected: Use local constant for bucket name
        await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
        throw new Error(dbError.message || "Database insert failed.");
      }
      console.log('DocumentContext: Database insert successful:', insertedDoc);

       // Enrich and add to state (similar logic as fetch, ensuring date parsing)
       const profile = user ? { id: user.id, first_name: user.user_metadata.first_name || '', last_name: user.user_metadata.last_name || '', avatar_url: user.user_metadata.avatar_url || null, email: user.email || '' } : null;
       const newEnrichedDoc: Document = {
         ...insertedDoc,
         expires_at: insertedDoc.expires_at && isValidDate(parseISO(insertedDoc.expires_at)) ? parseISO(insertedDoc.expires_at) : null,
         uploaded_by_profile: profile,
         folder: null,
         linked_expense: null,
       };
       setDocuments(prevDocs => [newEnrichedDoc, ...prevDocs.filter(d => d.id !== newEnrichedDoc.id)]);

       fetchDocumentsData(currentFolderId); // Trigger background refetch

      toast({ title: "Success", description: `Document "${insertedDoc.name}" uploaded.` });
      setIsUploading(false); setUploadProgress(null);
      return { data: insertedDoc, error: null };

    } catch (err: any) {
      console.error('DocumentContext: Upload error:', err);
      const errorMessage = (err instanceof Error ? err.message : String(err)) || "Upload failed.";
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
      setIsUploading(false); setUploadProgress(null);
      return { data: null, error: new Error(errorMessage) };
    }
  }, [selectedProperty?.id, user, currentFolderId, toast, fetchDocumentsData, supabase]);


  // deleteDocument (Corrected storage bucket usage)
  const deleteDocument = useCallback(async (docId: string, filePath: string): Promise<DbResult<null>> => {
    // Use storage_path consistently if that's the column name
    const storagePath = filePath; // Rename variable for clarity if needed
    if (!docId || !storagePath) { return { data: null, error: new Error("Missing ID or storage path.") }; }
    console.log(`Deleting document ${docId} at path ${storagePath}`);
    try {
        console.log(`Deleting storage file: ${storagePath}`);
        // Corrected: Use local constant for bucket name
        const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
        if (storageError && storageError.message !== 'The resource was not found') {
             console.error(`Storage delete error:`, storageError);
             toast({ title: "Storage Warning", description: `Could not delete file from storage: ${storageError.message}`, variant: "default" });
        } else {
            console.log(`Storage delete successful or file already gone.`);
        }

        console.log(`Deleting DB record: ${docId}`);
        const { error: dbError } = await supabase.from('documents').delete().eq('id', docId);
        if (dbError) { console.error(`DB delete error:`, dbError); throw new Error(dbError.message || "DB delete failed."); }
        console.log(`DB delete successful.`);

        setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== docId));
        toast({ title: "Success", description: "Document deleted." });
        return { data: null, error: null };
    } catch (err: any) {
        console.error(`Delete document error:`, err);
        const msg = (err instanceof Error ? err.message : String(err)) || "Deletion failed.";
        toast({ title: "Deletion Failed", description: msg, variant: "destructive" });
        return { data: null, error: new Error(msg) };
    }
  }, [toast, supabase]);


  // createFolder (Unchanged from user provided)
   const createFolder = useCallback(async (folderData: FolderFormData): Promise<DbResult<DocumentFolder>> => {
        const propertyId = selectedProperty?.id;
        const userId = user?.id;
        if (!propertyId || !userId) { return { data: null, error: new Error("Property/user missing.") }; }
        if (!folderData.name?.trim()) { return { data: null, error: new Error("Folder name needed.") }; }
        console.log("Creating folder:", folderData);

        const insertData: TablesInsert<'document_folders'> = {
            property_id: propertyId, created_by: userId, name: folderData.name.trim(),
            parent_folder_id: folderData.parent_folder_id || currentFolderId,
        };
        try {
            const { data, error } = await supabase.from('document_folders').insert(insertData).select().single();
            if (error) {
                console.error("Create folder error:", error);
                if (error.code === '23505') { throw new Error(`Folder "${insertData.name}" already exists in this location.`); }
                throw error;
            }
            console.log("Folder created:", data);
            setFolders(prevFolders => [...prevFolders, data]);
            toast({ title: "Success", description: `Folder "${data.name}" created.` });
            return { data, error: null };
        } catch (err: any) {
             console.error("Create folder catch:", err);
             const msg = (err instanceof Error ? err.message : String(err)) || "Could not create folder.";
             toast({ title: "Error", description: msg, variant: "destructive" });
             return { data: null, error: new Error(msg) };
        }
    }, [selectedProperty?.id, user?.id, currentFolderId, toast, supabase]);


  // deleteFolder (Unchanged from user provided)
  const deleteFolder = useCallback(async (folderId: string, deleteContainedFiles: boolean = false): Promise<DbResult<null>> => {
    if (!folderId) { return { data: null, error: new Error("Missing Folder ID.") }; }
    console.log(`Deleting folder ${folderId}. Delete content: ${deleteContainedFiles}`);

    if (deleteContainedFiles) {
        const warning = "Recursive delete not implemented. Only empty folders can be deleted.";
        toast({ title: "Not Implemented", description: warning, variant: "destructive" });
        return { data: null, error: new Error(warning) };
    }
    try {
        const { count: subfolderCount, error: subfolderError } = await supabase.from('document_folders').select('*', { count: 'exact', head: true }).eq('parent_folder_id', folderId);
        if (subfolderError) throw subfolderError;
        if (subfolderCount && subfolderCount > 0) { throw new Error("Folder not empty (contains subfolders). Please delete subfolders first."); }

        const { count: documentCount, error: documentError } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('folder_id', folderId);
        if (documentError) throw documentError;
        if (documentCount && documentCount > 0) { throw new Error("Folder not empty (contains documents). Please delete documents first."); }

        console.log(`Deleting empty folder record: ${folderId}`);
        const { error: deleteError } = await supabase.from('document_folders').delete().eq('id', folderId);
        if (deleteError) throw deleteError;

        console.log(`Deleted folder record ${folderId}`);
        setFolders(prevFolders => prevFolders.filter(f => f.id !== folderId));
        if (currentFolderId === folderId) { setCurrentFolderId(null); }
        toast({ title: "Success", description: "Folder deleted." });
        return { data: null, error: null };
    } catch (err: any) {
        console.error(`Delete folder error:`, err);
        const msg = (err instanceof Error ? err.message : String(err)) || "Could not delete folder.";
        toast({ title: "Error", description: msg, variant: "destructive" });
        return { data: null, error: new Error(msg) };
    }
  }, [toast, currentFolderId, setCurrentFolderId, supabase]);


  // updateDocument (Unchanged from user provided)
  const updateDocument = useCallback(async (docId: string, updateData: Partial<TablesUpdate<'documents'>>): Promise<DbResult<Document>> => {
      if (!docId) { return { data: null, error: new Error("Missing Document ID.") }; }
      console.log(`Updating document ${docId} with data:`, updateData);

      const existingDoc = documents.find(doc => doc.id === docId);
      if (!existingDoc) {
          console.error(`Cannot update: Document with ID ${docId} not found in local state.`);
          return { data: null, error: new Error(`Document with ID ${docId} not found.`) };
      }

      try {
        const dataToSubmit = { ...updateData };
        // Ensure Date objects are formatted to ISO strings for DB, handle null
        if (dataToSubmit.expires_at && dataToSubmit.expires_at instanceof Date) {
             dataToSubmit.expires_at = formatISO(dataToSubmit.expires_at);
        } else if (dataToSubmit.expires_at === null) {
             dataToSubmit.expires_at = null;
        } else if (typeof dataToSubmit.expires_at !== 'string' && dataToSubmit.expires_at !== null) {
            // If it's neither Date, string, nor null, treat as invalid? Or nullify?
            console.warn(`Invalid type for expires_at update: ${typeof dataToSubmit.expires_at}, setting to null.`);
            dataToSubmit.expires_at = null;
        }

        const { data: updatedDocRowData, error: dbError } = await supabase
            .from('documents')
            .update(dataToSubmit)
            .eq('id', docId)
            .select() // Select base row fields
            .single();

        if (dbError) { throw new Error(dbError.message || "Database update failed."); }
        if (!updatedDocRowData) { throw new Error("Updated document data not returned from Supabase."); }

        console.log(`DB update successful for doc ${docId}. Raw updated data:`, updatedDocRowData);

        // Merge: Keep existing enriched data, overwrite with updated base fields
        const finalUpdatedDoc: Document = {
            ...existingDoc,
            ...updatedDocRowData,
            // Re-parse date string from DB result back into Date object or null
            expires_at: updatedDocRowData.expires_at && isValidDate(parseISO(updatedDocRowData.expires_at)) ? parseISO(updatedDocRowData.expires_at) : null,
        };

        setDocuments(prevDocs => prevDocs.map(doc => doc.id === docId ? finalUpdatedDoc : doc));
        toast({ title: "Success", description: `Document "${finalUpdatedDoc.name}" updated.` });
        return { data: finalUpdatedDoc, error: null };

      } catch (err: any) {
            console.error(`Update document error:`, err);
            const msg = (err instanceof Error ? err.message : String(err)) || "Update failed.";
            toast({ title: "Update Failed", description: msg, variant: "destructive" });
            return { data: null, error: new Error(msg) };
      }
  }, [toast, documents, supabase]);


  // --- Placeholders for deferred functions --- (Unchanged from user provided)
  const deleteMultipleDocuments = useCallback(async (docsToDelete: {id: string, file_path: string}[]): Promise<{ successCount: number; failCount: number; errors: { id: string; message: string }[] }> => {
      console.warn("deleteMultipleDocuments function is not implemented.");
      await new Promise(res => setTimeout(res, 50));
      return { successCount: 0, failCount: docsToDelete.length, errors: docsToDelete.map(d => ({ id: d.id, message: "Not implemented" })) };
  }, [toast, supabase]);

  const updateFolder = useCallback(async (folderId: string, folderData: Partial<TablesUpdate<'document_folders'>>): Promise<DbResult<DocumentFolder>> => {
      console.warn("updateFolder function is not implemented.");
       await new Promise(res => setTimeout(res, 50));
      return { data: null, error: new Error("Update Folder Not Implemented") };
  }, [toast, supabase]);

  // Linking actions (Unchanged from user provided)
  const linkDocumentToExpense = useCallback(async (docId: string, expenseId: string): Promise<DbResult<Document>> => updateDocument(docId, { linked_expense_id: expenseId }), [updateDocument]);
  const unlinkDocumentFromExpense = useCallback(async (docId: string): Promise<DbResult<Document>> => updateDocument(docId, { linked_expense_id: null }), [updateDocument]);

  // getFolderPath (Unchanged from user provided)
  const getFolderPath = useCallback((folderId: string | null): DocumentFolder[] => {
    const path: DocumentFolder[] = [];
    if (!folderId) { return path; }
    const folderMap = new Map(folders.map(f => [f.id, f]));
    let currentFolder = folderMap.get(folderId);
    while (currentFolder) {
      path.unshift(currentFolder);
      if (currentFolder.parent_folder_id) {
        currentFolder = folderMap.get(currentFolder.parent_folder_id);
      } else { break; }
    }
    return path;
  }, [folders]);


  // --- Provider Value ---
  const value: DocumentContextType = {
    documents, folders,
    documentCategories: staticDocumentCategories, // Use derived categories array
    currentFolderId,
    isLoading: isLoading || isUploading,
    error, uploadProgress,
    fetchDocumentsData, fetchFolders: fetchAllFoldersForProperty, setCurrentFolderId,
    uploadDocument, deleteDocument, createFolder, deleteFolder,
    updateDocument,
    deleteMultipleDocuments, updateFolder,
    linkDocumentToExpense, unlinkDocumentFromExpense,
    getFolderPath,
  };

  return ( <DocumentContext.Provider value={value}> {children} </DocumentContext.Provider> );
}

// --- Custom Hook Definition --- (Unchanged from user provided)
export const useDocument = (): DocumentContextType => {
  const context = useContext(DocumentContext);
  if (context === undefined) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }
  return context;
};