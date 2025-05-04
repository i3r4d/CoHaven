// src/pages/documents/EditDocumentDialog.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
    DialogTitle, DialogClose
} from '@/components/ui/dialog';
import { Form, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocument } from '@/contexts/DocumentContext';
import { Loader2, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Document, TablesUpdate, DocumentCategoryId, StaticDocumentCategory } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid as isValidDate } from 'date-fns';

// Schema for editing (can omit file-related fields)
const DocumentEditSchema = z.object({
    name: z.string().min(1, { message: "Required" }).max(200),
    description: z.string().max(500).optional().nullable(),
    category_id: z.string().optional().nullable(), // Stays as string ID
    expiration_date: z.date().optional().nullable(), // RHF handles Date object
});

type EditDocumentDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    documentToEdit: Document | null;
};

export const EditDocumentDialog: React.FC<EditDocumentDialogProps> = ({ isOpen, onOpenChange, documentToEdit }) => {
    const { updateDocument, documentCategories } = useDocument();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof DocumentEditSchema>>({
        resolver: zodResolver(DocumentEditSchema),
        defaultValues: {
            name: '',
            description: '',
            category_id: null,
            expiration_date: null,
        },
    });
    const { control, handleSubmit, reset, formState: { errors } } = form;

    // Effect to populate form when documentToEdit changes or dialog opens
    useEffect(() => {
        if (documentToEdit && isOpen) {
            console.log("Populating edit form for:", documentToEdit.name);
            let expiryDate: Date | null = null;
            if (documentToEdit.expiration_date) {
                 try {
                    const parsedDate = parseISO(documentToEdit.expiration_date);
                    if (isValidDate(parsedDate)) {
                        expiryDate = parsedDate;
                    } else {
                         console.warn("Invalid expiration_date string from DB:", documentToEdit.expiration_date);
                    }
                 } catch (e) {
                    console.error("Error parsing expiration_date:", e);
                 }
            }

            reset({
                name: documentToEdit.name || '',
                description: documentToEdit.description || '',
                category_id: documentToEdit.category_id || null,
                expiration_date: expiryDate,
            });
        } else if (!isOpen) {
            // Optionally reset when closing if needed, though onOpenChange might handle it
             // reset(); // Can cause flicker if parent resets state too
        }
    }, [documentToEdit, isOpen, reset]);

    const handleOpenChange = useCallback((open: boolean) => {
        onOpenChange(open);
        if (!open) {
            // Reset form explicitly when dialog closes via external trigger or cancel
            reset({ name: '', description: '', category_id: null, expiration_date: null });
            setIsSubmitting(false); // Ensure submitting state is reset
        }
    }, [onOpenChange, reset]);


    const onSubmit = async (values: z.infer<typeof DocumentEditSchema>) => {
        if (!documentToEdit) {
            toast({ title: "Error", description: "No document selected for editing.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);

        // Prepare only the changed data for update
        const updateData: Partial<TablesUpdate<'documents'>> = {};
        if (values.name !== documentToEdit.name) updateData.name = values.name;
        if (values.description !== (documentToEdit.description || '')) updateData.description = values.description; // Handle null/empty string comparison
        if (values.category_id !== (documentToEdit.category_id || null)) updateData.category_id = values.category_id;

        // Compare dates carefully
        let currentExpiryDate: Date | null = null;
        if (documentToEdit.expiration_date) {
            try { const parsed = parseISO(documentToEdit.expiration_date); if (isValidDate(parsed)) currentExpiryDate = parsed; } catch {}
        }

        if (values.expiration_date?.getTime() !== currentExpiryDate?.getTime()) {
            updateData.expiration_date = values.expiration_date; // Pass Date object or null
        }


        // Only call update if there are actual changes
        if (Object.keys(updateData).length === 0) {
            toast({ title: "No Changes", description: "No changes were detected.", variant: "default" });
            setIsSubmitting(false);
            handleOpenChange(false); // Close dialog even if no changes
            return;
        }


        console.log("Calling updateDocument with:", documentToEdit.id, updateData);
        const result = await updateDocument(documentToEdit.id, updateData);
        setIsSubmitting(false);

        if (result.error) {
            toast({ title: "Update Failed", description: result.error.message || "Could not update document details.", variant: "destructive" });
        } else {
            toast({ title: "Success", description: `Document "${result.data?.name ?? 'details'}" updated.`, variant: "default" });
            handleOpenChange(false); // Close dialog on success
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Document Details</DialogTitle>
                    <DialogDescription>Update the metadata for "{documentToEdit?.name}". File content cannot be changed here.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">

                        {/* --- Name (Using Controller) --- */}
                        <FormItem>
                            <FormLabel htmlFor="edit-doc-name">Document Name</FormLabel>
                            <Controller
                                name="name"
                                control={control}
                                render={({ field }) => (
                                    <Input id="edit-doc-name" placeholder="e.g., Annual Insurance Policy" {...field} disabled={isSubmitting} />
                                )}
                            />
                            {errors.name && <FormMessage>{errors.name.message}</FormMessage>}
                        </FormItem>

                        {/* --- Description (Using Controller) --- */}
                        <FormItem>
                            <FormLabel htmlFor="edit-doc-description">Description (Optional)</FormLabel>
                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <Textarea
                                        id="edit-doc-description"
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
                                        value={field.value ?? 'null'} // Bind to controller value, handle null
                                        onValueChange={(value) => field.onChange(value === 'null' ? null : value)} // Use controller onChange
                                        disabled={isSubmitting}
                                    >
                                        <SelectTrigger> <SelectValue placeholder="Select a category..." /> </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="null"> <em>-- None --</em> </SelectItem>
                                            {documentCategories.map((cat: StaticDocumentCategory) => ( <SelectItem key={cat.id} value={cat.id}> {cat.name} </SelectItem> ))}
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
                                                type="button" // Ensure it doesn't submit form
                                                className={cn("w-full justify-start pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={field.value ?? undefined} // Handle null for Calendar
                                                onSelect={(date) => field.onChange(date ?? null)} // Use controller onChange, pass null if cleared
                                                disabled={(date) => date < new Date("1900-01-01") || isSubmitting}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            />
                             {/* Add button to clear date */}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-1 text-xs text-muted-foreground"
                                onClick={() => form.setValue('expiration_date', null)}
                                disabled={isSubmitting || !form.getValues('expiration_date')}
                            >
                                Clear date
                            </Button>
                            {errors.expiration_date && <FormMessage>{errors.expiration_date.message}</FormMessage>}
                        </FormItem>


                        {/* --- Footer --- */}
                        <DialogFooter className="pt-4">
                            <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={isSubmitting}> Cancel </Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSubmitting || !documentToEdit}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};