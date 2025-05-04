// src/pages/documents/CreateFolderDialog.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose, // Import DialogClose
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useDocument } from '@/contexts/DocumentContext';
import { FolderPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FolderFormData } from '@/integrations/supabase/types';

// Schema for folder creation form
const FolderSchema = z.object({
    name: z.string().min(1, { message: 'Folder name cannot be empty.' }).max(100, { message: 'Folder name is too long (max 100 characters).' }),
    // parent_folder_id is passed as a prop, not part of the user-filled form
});

type CreateFolderDialogProps = {
    parentFolderId: string | null; // The folder we are creating *inside* (null for root)
    triggerButton?: React.ReactNode; // Optional custom trigger
};

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({ parentFolderId, triggerButton }) => {
    const { createFolder } = useDocument();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof FolderSchema>>({
        resolver: zodResolver(FolderSchema),
        defaultValues: {
            name: '',
        },
    });

    const onSubmit = async (values: z.infer<typeof FolderSchema>) => {
        setIsSubmitting(true);
        const folderData: FolderFormData = {
            name: values.name,
            parent_folder_id: parentFolderId,
        };

        const result = await createFolder(folderData);

        setIsSubmitting(false);

        if (result.error) {
            // Error toast is handled within the context function generally, but we could add specific ones here if needed.
            // console.error("Create Folder Dialog Error:", result.error.message);
            // The context already shows a generic error toast.
        } else {
            // Context shows success toast, but maybe a more specific one here? Or rely on context.
            // toast({ title: "Success", description: `Folder "${result.data.name}" created.` });
            form.reset(); // Reset form fields
            setIsOpen(false); // Close the dialog on success
        }
    };

    // Reset form state when dialog closes or opens
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            form.reset();
            setIsSubmitting(false); // Ensure submitting state is reset if closed prematurely
        }
        setIsOpen(open);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {triggerButton ? triggerButton : (
                     <Button variant="outline" size="sm">
                        <FolderPlus className="mr-2 h-4 w-4" /> Create Folder
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>
                       Enter a name for the new folder. It will be created inside the current folder view.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    {/* Prevent default form submission which causes page reload */}
                    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(onSubmit)(); }} className="space-y-4 py-2">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Folder Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Invoices, Manuals" {...field} disabled={isSubmitting} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Folder
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};