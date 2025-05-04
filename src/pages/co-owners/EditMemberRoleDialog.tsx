import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCoOwner } from '@/contexts/CoOwnerContext';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { MemberRole } from '@/integrations/supabase/types';

// Define the validation schema
const editRoleSchema = z.object({
  role: z.enum(['co_owner', 'guest'], { // Only allow changing to co_owner or guest
    required_error: "Please select a new role.",
  }),
});

type EditRoleFormData = z.infer<typeof editRoleSchema>;

interface EditMemberRoleDialogProps {
  trigger: React.ReactNode; // The element that opens the dialog
  memberId: string; // The property_members.id of the member to edit
  currentRole: MemberRole | null; // The current role of the member
}

export function EditMemberRoleDialog({ trigger, memberId, currentRole }: EditMemberRoleDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { updateMemberRole, isLoadingAction } = useCoOwner();

  // Ensure currentRole is valid for the form ('co_owner' or 'guest')
  // If the current role is 'owner' (which shouldn't be editable via UI) or null, default to 'co_owner'
  const validDefaultRole = currentRole === 'co_owner' || currentRole === 'guest' ? currentRole : 'co_owner';

  const form = useForm<EditRoleFormData>({
    resolver: zodResolver(editRoleSchema),
    defaultValues: {
      role: validDefaultRole,
    },
  });

   // Reset form when currentRole changes (e.g., opening dialog for different users)
   useEffect(() => {
    const validRole = currentRole === 'co_owner' || currentRole === 'guest' ? currentRole : 'co_owner';
    form.reset({ role: validRole });
  }, [currentRole, form]);


  const onSubmit = async (data: EditRoleFormData) => {
    // Type assertion safe due to schema
    const newRole = data.role as Extract<MemberRole, 'co_owner' | 'guest'>;
    await updateMemberRole(memberId, newRole);
    // Context handles toast messages
    // Close dialog after action attempt
    setIsOpen(false);
    // No need to manually reset form here, useEffect handles it based on props or closing action will
  };

  // Handle open state change
  const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
      if (!open) {
           // Reset form based on the *original* currentRole prop when closing
           const validRole = currentRole === 'co_owner' || currentRole === 'guest' ? currentRole : 'co_owner';
           form.reset({ role: validRole });
      }
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Edit Member Role</DialogTitle>
          <DialogDescription>
            Select the new role for this member. Only owners can perform this action.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 pb-4">
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a new role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Only allow changing to co_owner or guest */}
                      <SelectItem value="co_owner">Co-owner</SelectItem>
                      <SelectItem value="guest">Guest</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
               <DialogClose asChild>
                   <Button type="button" variant="outline">Cancel</Button>
               </DialogClose>
              <Button type="submit" disabled={isLoadingAction}>
                {isLoadingAction ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}