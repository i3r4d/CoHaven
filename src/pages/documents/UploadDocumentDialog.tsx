// src/pages/documents/UploadDocumentDialog.tsx
import React, { useState, useRef, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form'; // Import Controller
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
    DialogTitle, DialogTrigger, DialogClose
} from '@/components/ui/dialog';
import { Form, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'; // Keep FormItem, Label, Message, Description
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label"; // For Progress Label
import { useAuth } from '@/contexts/AuthContext';
import { useDocument } from '@/contexts/DocumentContext';
import { PlusCircle, Loader2, FileUp, CalendarIcon, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DocumentUploadPayload, DocumentCategoryId } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// Schema (Unchanged)
const DocumentUploadSchema = z.object({
    name: z.string().min(1, { message: "Required" }).max(200),
    description: z.string().max(500).optional().nullable(),
    category_id: z.string().optional().nullable(),
    expiration_date: z.date().optional().nullable(),
});

type UploadDocumentDialogProps = {
    folderId: string | null;
    triggerButton?: React.ReactNode;
};

export const UploadDocumentDialog: React.FC<UploadDocumentDialogProps> = ({ folderId, triggerButton }) => {
    const { user } = useAuth();
    const { uploadDocument, documentCategories, uploadProgress } = useDocument();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const form = useForm<z.infer<typeof DocumentUploadSchema>>({
        resolver: zodResolver(DocumentUploadSchema),
        defaultValues: { name: '', description: '', category_id: null, expiration_date: null, },
    });
    const { control, handleSubmit, setValue, getValues, formState: { errors } } = form; // Destructure control and errors

    // Handlers (Unchanged logic)
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) { setSelectedFile(file); if (!getValues('name')) { setValue('name', file.name.replace(/\.[^/.]+$/, "")); } } else { setSelectedFile(null); } };
    const resetDialogState = useCallback(() => { form.reset(); setSelectedFile(null); setIsSubmitting(false); if (fileInputRef.current) { fileInputRef.current.value = ''; } }, [form]);
    const handleOpenChange = (open: boolean) => { setIsOpen(open); if (!open) { resetDialogState(); } };
    const onSubmit = async (values: z.infer<typeof DocumentUploadSchema>) => { if (!selectedFile) { toast({ title: "Error", description: "No file selected.", variant: "destructive" }); return; } if (!user?.id) { toast({ title: "Error", description: "Auth error.", variant: "destructive" }); return; } setIsSubmitting(true); const payload: DocumentUploadPayload = { name: values.name, description: values.description, category_id: values.category_id as DocumentCategoryId | null, expiration_date: values.expiration_date, file: selectedFile, folder_id: folderId, linked_expense_id: null, }; const result = await uploadDocument(payload); setIsSubmitting(false); if (result.error) { toast({ title: "Upload Failed", description: result.error.message || "Upload failed.", variant: "destructive" }); } else { toast({ title: "Success", description: `Document "${result.data?.name ?? 'file'}" uploaded.`, variant: "default" }); handleOpenChange(false); } };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {triggerButton ? triggerButton : ( <Button size="sm"> <PlusCircle className="mr-2 h-4 w-4" /> Upload Document </Button> )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader> <DialogTitle>Upload New Document</DialogTitle> <DialogDescription> Select a file and provide details. Max file size: 50MB. </DialogDescription> </DialogHeader>
                {/* Form component is still useful for context if needed, but not FormField */}
                <Form {...form}>
                    {/* Use standard form tag */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">

                        {/* --- File Input (Manual) --- */}
                        <FormItem>
                            <FormLabel htmlFor="file-upload">File</FormLabel>
                            <Input id="file-upload" type="file" ref={fileInputRef} onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer" disabled={isSubmitting} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv" />
                            {selectedFile && !isSubmitting && ( <FormDescription className='flex items-center justify-between text-sm text-muted-foreground mt-1'> <span>Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span> <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => { setSelectedFile(null); if(fileInputRef.current) fileInputRef.current.value=''; setValue('name', ''); }}> <X className="h-4 w-4"/> <span className="sr-only">Clear file</span> </Button> </FormDescription> )}
                            {!selectedFile && form.formState.isSubmitted && ( <FormMessage>Please select a file to upload.</FormMessage> )}
                        </FormItem>

                        {/* --- Name (Using Controller) --- */}
                        <FormItem>
                             <FormLabel htmlFor="doc-name">Document Name</FormLabel>
                             <Controller
                                name="name"
                                control={control}
                                render={({ field }) => (
                                    <Input id="doc-name" placeholder="e.g., Annual Insurance Policy" {...field} disabled={isSubmitting} />
                                )}
                            />
                            {errors.name && <FormMessage>{errors.name.message}</FormMessage>}
                        </FormItem>

                        {/* --- Description (Using Controller) --- */}
                        <FormItem>
                            <FormLabel htmlFor="doc-description">Description (Optional)</FormLabel>
                             <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <Textarea
                                        id="doc-description"
                                        placeholder="Add any relevant notes..."
                                        {...field}
                                        value={field.value ?? ''} // Handle null value
                                        disabled={isSubmitting}
                                        rows={3}
                                    />
                                )}
                            />
                            {errors.description && <FormMessage>{errors.description.message}</FormMessage>}
                        </FormItem>

                         {/* --- Category Select (Using Controller) --- */}
                        <FormItem>
                             <FormLabel>Category (Optional)</FormLabel>
                             <Controller
                                name="category_id"
                                control={control}
                                render={({ field }) => (
                                    <Select
                                        value={field.value ?? 'null'} // Bind to controller value
                                        onValueChange={(value) => field.onChange(value === 'null' ? null : value)} // Use controller onChange
                                        disabled={isSubmitting}
                                    >
                                        <SelectTrigger> <SelectValue placeholder="Select a category..." /> </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="null"> <em>-- None --</em> </SelectItem>
                                            {documentCategories.map((cat) => ( <SelectItem key={cat.id} value={cat.id}> {cat.name} </SelectItem> ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                             {errors.category_id && <FormMessage>{errors.category_id.message}</FormMessage>}
                        </FormItem>

                        {/* --- Expiration Date (Using Controller) --- */}
                        <FormItem>
                            <FormLabel>Expiration Date (Optional)</FormLabel>
                             <Controller
                                name="expiration_date"
                                control={control}
                                render={({ field }) => (
                                     <Popover>
                                        <PopoverTrigger asChild disabled={isSubmitting}>
                                            <Button
                                                variant={"outline"}
                                                type="button"
                                                className={cn("w-full justify-start pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={field.value ?? undefined}
                                                onSelect={(date) => field.onChange(date ?? null)} // Use controller onChange
                                                disabled={(date) => date < new Date("1900-01-01") || isSubmitting}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            />
                            {errors.expiration_date && <FormMessage>{errors.expiration_date.message}</FormMessage>}
                        </FormItem>

                        {/* --- Upload Progress Indicator (Unchanged) --- */}
                        {isSubmitting && uploadProgress !== null && ( <div className="space-y-1"> <Label htmlFor="upload-progress" className="text-sm font-medium">Upload Progress</Label> <Progress id="upload-progress" value={uploadProgress} className="w-full" /> <p className="text-xs text-muted-foreground text-center">{Math.round(uploadProgress)}%</p> </div> )}

                        {/* --- Footer --- */}
                        <DialogFooter className="pt-4">
                            {/* Use DialogClose with asChild now - should be safer outside form field context */}
                            <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={isSubmitting}> Cancel </Button>
                            </DialogClose>
                            <Button type="submit" disabled={!selectedFile || isSubmitting}> {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {isSubmitting ? 'Uploading...' : 'Upload Document'} </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};