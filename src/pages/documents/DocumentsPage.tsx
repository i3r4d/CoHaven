// src/pages/documents/DocumentsPage.tsx
// Corrected: Removed 'Constants' import, defined local bucket names, and replaced usage.

import React, { useState, useMemo, useCallback } from 'react';
import { useDocument } from '@/contexts/DocumentContext';
import { useProperty } from '@/contexts/PropertyContext';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
    Folder, FileText, MoreVertical, Download, Edit2, Trash2, LinkIcon, PlusCircle, Search, FolderCog, FolderX,
    Home,
    // Category Icons:
    ShieldCheck, Receipt, Scale, Wrench, Landmark, FileSignature, BarChart3, FileQuestion,
    ArrowUpDown, ArrowDown, ArrowUp
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO, isValid as isValidDate, compareAsc, compareDesc } from 'date-fns';
import { cn, formatDate } from '@/lib/utils';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// Corrected Import: Removed Constants
import {
    Document as DocumentType, DocumentFolder, StaticDocumentCategory,
    DocumentSortKey, SortDirection, DocumentCategory as DocumentCategoryId // Renamed imported enum
} from '@/integrations/supabase/types';
import { CreateFolderDialog } from './CreateFolderDialog';
import { UploadDocumentDialog } from './UploadDocumentDialog';
import { EditDocumentDialog } from './EditDocumentDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// --- Define local bucket names ---
const DOCUMENTS_BUCKET = 'property-documents';
const RECEIPTS_BUCKET = 'expense-receipts';

// --- HELPER FUNCTIONS ---
const formatBytes = (bytes: number | null | undefined, decimals = 2): string => {
  if (bytes == null || !+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Note: Check if DocumentCategoryId type from types.ts aligns with the category IDs used here ('insurance', 'invoice', etc.)
const getCategoryIcon = (categoryId: DocumentCategoryId | string | null): React.ReactNode => {
    const className = "h-5 w-5 shrink-0";
    switch (categoryId) {
        // Assuming DocumentCategoryId enum values match these strings
        case 'insurance': return <ShieldCheck className={cn(className, "text-blue-600")} />;
        case 'invoice': return <Receipt className={cn(className, "text-green-600")} />;
        case 'legal': return <Scale className={cn(className, "text-gray-700")} />;
        case 'maintenance': return <Wrench className={cn(className, "text-orange-600")} />;
        case 'tax': return <Landmark className={cn(className, "text-purple-600")} />;
        case 'agreement': return <FileSignature className={cn(className, "text-indigo-600")} />;
        case 'report': return <BarChart3 className={cn(className, "text-pink-600")} />;
        case 'other': return <FileText className={cn(className, "text-gray-500")} />;
        case null:
        default:
            return <FileQuestion className={cn(className, "text-gray-400")} />;
    }
};

const getCategoryName = (categoryId: string | null, categories: readonly StaticDocumentCategory[]): string => {
    if (!categoryId) return '-';
    const category = categories.find(cat => cat.id === categoryId);
    // Use optional chaining for safety
    return category?.name || categoryId;
};
// --- END HELPER FUNCTIONS ---


const DocumentsPage: React.FC = () => {
    // --- CONTEXT & HOOKS ---
    const { selectedProperty } = useProperty();
    const { toast } = useToast();
    const {
        documents, folders, documentCategories, currentFolderId, isLoading, error,
        setCurrentFolderId, getFolderPath, deleteDocument, deleteFolder
    } = useDocument();
    // --- END CONTEXT & HOOKS ---

    // --- STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
    const [docToDelete, setDocToDelete] = useState<DocumentType | null>(null);
    const [showFolderDeleteConfirm, setShowFolderDeleteConfirm] = useState<boolean>(false);
    const [folderToDelete, setFolderToDelete] = useState<DocumentFolder | null>(null);
    const [showEditDialog, setShowEditDialog] = useState<boolean>(false);
    const [docToEdit, setDocToEdit] = useState<DocumentType | null>(null);
    const [sortKey, setSortKey] = useState<DocumentSortKey>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    // --- END STATE ---


    // --- MEMOS & CALCULATIONS ---
    const currentFolderPath: DocumentFolder[] = useMemo(() => {
        // Ensure getFolderPath exists and is a function before calling
        return typeof getFolderPath === 'function' ? getFolderPath(currentFolderId) : [];
    }, [currentFolderId, getFolderPath]);

    const currentLevelFolders = useMemo(() => {
        return folders
            .filter(f => f.parent_folder_id === currentFolderId)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }, [folders, currentFolderId]);

    const sortedAndFilteredDocuments = useMemo(() => {
        const filtered = searchTerm
            ? documents.filter(doc => doc.name.toLowerCase().includes(searchTerm.toLowerCase()))
            : [...documents]; // Create shallow copy for sorting

        // Type guard for sorting dates
        const isValidSortableDate = (value: any): value is Date | string | number => {
            if (value instanceof Date && isValidDate(value)) return true;
            if (typeof value === 'string' && isValidDate(parseISO(value))) return true;
            return false;
        };

        return filtered.sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            const dirMultiplier = sortDirection === 'asc' ? 1 : -1;

            if (valA == null && valB == null) return 0;
            if (valA == null) return 1 * dirMultiplier; // Sort nulls last in ascending
            if (valB == null) return -1 * dirMultiplier; // Sort nulls last in ascending

            switch (sortKey) {
                case 'name':
                case 'file_type':
                    // Ensure values are strings for localeCompare
                    return String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' }) * dirMultiplier;
                case 'file_size':
                    // Ensure values are numbers
                    return (Number(valA) - Number(valB)) * dirMultiplier;
                case 'uploaded_at':
                case 'expires_at': // Ensure this key exists on DocumentType or handle error
                    try {
                        // Use the type guard
                        if (!isValidSortableDate(valA) && !isValidSortableDate(valB)) return 0;
                        if (!isValidSortableDate(valA)) return 1 * dirMultiplier;
                        if (!isValidSortableDate(valB)) return -1 * dirMultiplier;

                        // Parse valid dates for comparison
                        const dateA = valA instanceof Date ? valA : parseISO(String(valA));
                        const dateB = valB instanceof Date ? valB : parseISO(String(valB));

                        return compareAsc(dateA, dateB) * dirMultiplier;
                    } catch (e) {
                        console.warn("Date sorting error:", e, "Values:", valA, valB);
                        return 0;
                    }
                default:
                     // Add exhaustive check if possible, otherwise return 0
                     // const _exhaustiveCheck: never = sortKey;
                    return 0;
            }
        });
    }, [documents, searchTerm, sortKey, sortDirection]);
    // --- END MEMOS & CALCULATIONS ---


    // --- HANDLERS ---
    const handleFolderClick = useCallback((folderId: string | null) => {
        if (folderId !== currentFolderId) {
             console.log(`Navigating to folder: ${folderId ?? 'root'}`);
             setCurrentFolderId(folderId);
             setSearchTerm('');
        } else {
             console.log(`Already in folder: ${folderId ?? 'root'}`);
        }
    }, [setCurrentFolderId, currentFolderId]);

    // Corrected: Use local bucket name constants
    const handleDownload = useCallback(async (doc: DocumentType) => {
        const storagePath = doc.storage_path; // Use storage_path consistently
        if (!storagePath) {
            toast({ title: "Error", description: "Document path not found.", variant: "destructive" });
            return;
        }
        try {
            // Determine bucket based on link, use local constants
            const bucket = doc.linked_expense_id ? RECEIPTS_BUCKET : DOCUMENTS_BUCKET;
            console.log(`Attempting download from bucket: ${bucket} for path: ${storagePath}`);

            const { data, error: signedUrlError } = await supabase.storage
                .from(bucket)
                .createSignedUrl(storagePath, 60); // 60 seconds validity

            if (signedUrlError) throw signedUrlError;
            if (!data?.signedUrl) throw new Error("Could not generate download link.");

            console.log(`Generated signed URL for ${doc.name}`);
            // Use window.open for direct download/view in new tab
            window.open(data.signedUrl, '_blank');
            toast({ title: "Success", description: `Preparing "${doc.name}" for download/view...`, variant: "default" });
        } catch (err: any) {
            console.error("Error downloading document:", err);
            toast({ title: "Download Failed", description: err.message || "Could not get download link.", variant: "destructive" });
        }
    }, [toast, supabase]); // Added supabase dependency

    const initiateDeleteDoc = useCallback((doc: DocumentType) => { setDocToDelete(doc); setShowDeleteConfirm(true); }, []);
    const confirmDeleteDoc = useCallback(async () => {
        // Use storage_path consistently
        if (!docToDelete || !docToDelete.storage_path) {
            toast({ title: "Error", description: "Document details missing.", variant: "destructive" });
            setShowDeleteConfirm(false); return;
        }
        // Pass storage_path to deleteDocument
        await deleteDocument(docToDelete.id, docToDelete.storage_path);
        setShowDeleteConfirm(false); setDocToDelete(null);
    }, [docToDelete, deleteDocument, toast]);

    const cancelDeleteDoc = useCallback(() => { setDocToDelete(null); setShowDeleteConfirm(false); }, []);
    const initiateDeleteFolder = useCallback((folder: DocumentFolder) => { setFolderToDelete(folder); setShowFolderDeleteConfirm(true); }, []);
    const confirmDeleteFolder = useCallback(async () => { if (!folderToDelete) return; await deleteFolder(folderToDelete.id); setShowFolderDeleteConfirm(false); setFolderToDelete(null); }, [folderToDelete, deleteFolder]);
    const cancelDeleteFolder = useCallback(() => { setFolderToDelete(null); setShowFolderDeleteConfirm(false); }, []);
    const initiateEditDoc = useCallback((doc: DocumentType) => { setDocToEdit(doc); setShowEditDialog(true); }, []);
    const handleEditDialogChange = useCallback((open: boolean) => { setShowEditDialog(open); if (!open) { setDocToEdit(null); } }, []);
    const handleSort = useCallback((key: DocumentSortKey) => { setSortDirection(prevDirection => (sortKey === key && prevDirection === 'asc' ? 'desc' : 'asc')); setSortKey(key); }, [sortKey]);
    const renderSortIcon = (key: DocumentSortKey) => { if (sortKey !== key) { return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50 shrink-0" />; } return sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 text-primary shrink-0" /> : <ArrowDown className="ml-2 h-4 w-4 text-primary shrink-0" />; };
    // --- END HANDLERS ---


    // --- LOADING & ERROR STATES ---
    const renderSkeletons = (count = 5) => ( Array.from({ length: count }).map((_, index) => ( <TableRow key={`skel-${index}`}> <TableCell className="w-[40px] px-4"><Skeleton className="h-6 w-6 rounded" /></TableCell> <TableCell className="px-4"><Skeleton className="h-5 w-4/5 rounded" /></TableCell> <TableCell className="hidden md:table-cell px-4"><Skeleton className="h-5 w-3/4 rounded" /></TableCell> <TableCell className="hidden lg:table-cell px-4"><Skeleton className="h-5 w-1/2 rounded" /></TableCell> <TableCell className="hidden lg:table-cell px-4"><Skeleton className="h-5 w-3/4 rounded" /></TableCell> <TableCell className="hidden md:table-cell px-4"><Skeleton className="h-5 w-3/4 rounded" /></TableCell> <TableCell className="hidden md:table-cell px-4"><Skeleton className="h-5 w-1/2 rounded" /></TableCell> <TableCell className="w-[40px] px-4"><Skeleton className="h-8 w-8 rounded" /></TableCell> </TableRow> )) );
    if (!selectedProperty) { return ( <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Please select a property.</p></div> ); }
    if (error) { return ( <div className="flex items-center justify-center h-full"><p className="text-destructive">Error: {error.message}</p></div> ); }
    // --- END LOADING & ERROR STATES ---

    // --- MAIN JSX RENDER ---
    return (
        <div className="flex flex-col h-full space-y-4 p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary"> Documents ({selectedProperty.name}) </h1>
                <div className="flex space-x-2">
                    <CreateFolderDialog parentFolderId={currentFolderId} />
                    <UploadDocumentDialog folderId={currentFolderId} />
                </div>
            </div>

            {/* Breadcrumbs & Search */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <button
                                onClick={() => handleFolderClick(null)}
                                disabled={currentFolderId === null || isLoading}
                                className={cn(
                                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                                    "h-7 w-7",
                                    (currentFolderId === null || isLoading)
                                        ? "text-muted-foreground/50 cursor-default"
                                        : "text-muted-foreground hover:text-primary hover:bg-muted"
                                )}
                                aria-label="Go to root folder"
                            >
                                <Home className="h-4 w-4" />
                            </button>
                        </BreadcrumbItem>
                        {currentFolderPath.map((folder, index) => (
                            <React.Fragment key={folder.id}>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbLink
                                        onClick={() => handleFolderClick(folder.id)}
                                        className={cn(
                                            "text-sm transition-colors",
                                            isLoading
                                              ? "text-foreground pointer-events-none"
                                              : "text-muted-foreground hover:text-primary cursor-pointer",
                                            index === currentFolderPath.length - 1 && !isLoading && "font-medium text-primary"
                                        )}
                                        aria-disabled={isLoading}
                                        style={{ cursor: isLoading ? 'default' : 'pointer' }}
                                    >
                                        {folder.name}
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                            </React.Fragment>
                        ))}
                    </BreadcrumbList>
                </Breadcrumb>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search documents..."
                        className="pl-8" value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={isLoading && documents.length === 0 && folders.length === 0} // Disable only if truly loading initial empty state
                    />
                </div>
            </div>

            {/* Content Table */}
            <Card className="flex-grow overflow-hidden border shadow-sm">
                <CardContent className="p-0 h-full overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted/50 z-10">
                             <TableRow>
                                <TableHead className="w-[40px] px-4"></TableHead>
                                <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors px-4">
                                    <Button variant="ghost" onClick={() => handleSort('name')} className="px-0 py-2 h-auto flex items-center w-full justify-start hover:bg-transparent font-semibold text-foreground"> Name {renderSortIcon('name')} </Button>
                                </TableHead>
                                <TableHead className="hidden md:table-cell px-4 font-semibold text-foreground">Category</TableHead>
                                <TableHead className="hidden lg:table-cell cursor-pointer hover:bg-muted/80 transition-colors px-4">
                                    <Button variant="ghost" onClick={() => handleSort('file_size')} className="px-0 py-2 h-auto flex items-center w-full justify-start hover:bg-transparent font-semibold text-foreground"> Size {renderSortIcon('file_size')} </Button>
                                </TableHead>
                                <TableHead className="hidden lg:table-cell cursor-pointer hover:bg-muted/80 transition-colors px-4">
                                    <Button variant="ghost" onClick={() => handleSort('uploaded_at')} className="px-0 py-2 h-auto flex items-center w-full justify-start hover:bg-transparent font-semibold text-foreground"> Uploaded {renderSortIcon('uploaded_at')} </Button>
                                </TableHead>
                                <TableHead className="hidden md:table-cell px-4 font-semibold text-foreground">Uploaded By</TableHead>
                                <TableHead className="hidden md:table-cell cursor-pointer hover:bg-muted/80 transition-colors px-4">
                                    <Button variant="ghost" onClick={() => handleSort('expires_at')} className="px-0 py-2 h-auto flex items-center w-full justify-start hover:bg-transparent font-semibold text-foreground"> Expires {renderSortIcon('expires_at')} </Button>
                                </TableHead>
                                <TableHead className="w-[40px] text-right px-4 font-semibold text-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && currentLevelFolders.length === 0 && sortedAndFilteredDocuments.length === 0 ? (
                                renderSkeletons()
                            ) : (
                                <>
                                    {currentLevelFolders.map((folder) => (
                                        <TableRow key={folder.id} className="group hover:bg-muted/50" >
                                            <TableCell className="cursor-pointer py-3 px-4" onClick={() => handleFolderClick(folder.id)}>
                                                <Folder className="h-5 w-5 text-yellow-600 shrink-0" />
                                            </TableCell>
                                            <TableCell className="font-medium cursor-pointer py-3 px-4" colSpan={6} onClick={() => handleFolderClick(folder.id)}>
                                                {folder.name}
                                            </TableCell>
                                            <TableCell className="text-right py-1 px-4">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"> <MoreVertical className="h-4 w-4" /> <span className="sr-only">Folder Actions</span> </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Folder Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-red-600 focus:text-red-700 focus:bg-red-50" onClick={(e) => { e.stopPropagation(); initiateDeleteFolder(folder); }}>
                                                            <FolderX className="mr-2 h-4 w-4" /> Delete Folder
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {sortedAndFilteredDocuments.map((doc) => (
                                        <TableRow key={doc.id} className="group hover:bg-muted/50">
                                            <TableCell className="py-3 px-4">{getCategoryIcon(doc.category)}</TableCell> {/* Use category directly */}
                                            <TableCell className="font-medium py-3 px-4">{doc.name}</TableCell>
                                            <TableCell className="hidden md:table-cell text-muted-foreground py-3 px-4"> {getCategoryName(doc.category, documentCategories)} </TableCell> {/* Use category */}
                                            <TableCell className="hidden lg:table-cell text-muted-foreground py-3 px-4">{formatBytes(doc.file_size)}</TableCell>
                                            <TableCell className="hidden lg:table-cell text-muted-foreground py-3 px-4">{formatDate(doc.uploaded_at)}</TableCell>
                                            {/* Ensure profile structure matches */}
                                            <TableCell className="hidden md:table-cell text-muted-foreground py-3 px-4"> {doc.uploaded_by_profile ? `${doc.uploaded_by_profile.first_name ?? ''} ${doc.uploaded_by_profile.last_name ?? ''}`.trim() : 'System'} </TableCell>
                                            <TableCell className="hidden md:table-cell text-muted-foreground py-3 px-4">{formatDate(doc.expires_at)}</TableCell>
                                            <TableCell className="text-right py-1 px-4">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"> <MoreVertical className="h-4 w-4" /> <span className="sr-only">Document Actions</span> </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Document Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}> <Download className="mr-2 h-4 w-4" /> Download </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); initiateEditDoc(doc); }}> <Edit2 className="mr-2 h-4 w-4" /> Edit Details </DropdownMenuItem>
                                                        <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}> <LinkIcon className="mr-2 h-4 w-4" /> {doc.linked_expense_id ? 'View Linked Expense' : 'Link to Expense'} </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-red-600 focus:text-red-700 focus:bg-red-50" onClick={(e) => { e.stopPropagation(); initiateDeleteDoc(doc); }}> <Trash2 className="mr-2 h-4 w-4" /> Delete Document </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!isLoading && currentLevelFolders.length === 0 && sortedAndFilteredDocuments.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                                {searchTerm ? 'No documents match your search.' : 'This folder is empty.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Dialogs */}
             <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                 <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle> <AlertDialogDescription> This action cannot be undone. This will permanently delete the document <span className="font-semibold px-1">{docToDelete?.name}</span> from storage and remove its record. </AlertDialogDescription> </AlertDialogHeader> <AlertDialogFooter> <AlertDialogCancel onClick={cancelDeleteDoc}>Cancel</AlertDialogCancel> <AlertDialogAction onClick={confirmDeleteDoc} className={buttonVariants({ variant: "destructive" })}> Delete Document </AlertDialogAction> </AlertDialogFooter> </AlertDialogContent>
            </AlertDialog>

             <AlertDialog open={showFolderDeleteConfirm} onOpenChange={setShowFolderDeleteConfirm}>
                 <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Delete Folder?</AlertDialogTitle> <AlertDialogDescription> Are you sure you want to delete the folder <span className="font-semibold px-1">{folderToDelete?.name}</span>? <strong className='block pt-2'>This folder must be empty to be deleted.</strong> This action cannot be undone. </AlertDialogDescription> </AlertDialogHeader> <AlertDialogFooter> <AlertDialogCancel onClick={cancelDeleteFolder}>Cancel</AlertDialogCancel> <AlertDialogAction onClick={confirmDeleteFolder} className={buttonVariants({ variant: "destructive" })}> Delete Folder </AlertDialogAction> </AlertDialogFooter> </AlertDialogContent>
            </AlertDialog>

            <EditDocumentDialog
                isOpen={showEditDialog}
                onOpenChange={handleEditDialogChange}
                documentToEdit={docToEdit}
            />
        </div>
    );
};

export default DocumentsPage;