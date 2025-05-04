import React, { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import { MemberRole } from '@/integrations/supabase/types';

// Define the validation schema
const inviteSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  role: z.enum(['co_owner', 'guest'], { // Only allow inviting as co_owner or guest
    required_error: "Please select a role for the member.",
  }),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteMemberDialogProps {
  trigger: React.ReactNode; // The element that opens the dialog
}

export function InviteMemberDialog({ trigger }: InviteMemberDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { inviteMember, isLoadingAction } = useCoOwner();

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'co_owner', // Default role selection
    },
  });

  const onSubmit = async (data: InviteFormData) => {
    // Type assertion needed as schema only allows 'co_owner' or 'guest'
    const roleToInvite = data.role as Extract<MemberRole, 'co_owner' | 'guest'>;
    await inviteMember(data.email, roleToInvite);
    // CoOwnerContext handles toast messages for success/error
    // Close dialog only if invite was successful (isLoadingAction becomes false and no error)
    // Check form state for successful submission (or check context state if needed)
    if (!form.formState.isSubmitting && form.formState.isSubmitSuccessful) {
        // Explicitly close and reset AFTER submission attempt completes
        setIsOpen(false);
        form.reset(); // Reset form fields
    }
     // Or perhaps let the context handle error state and keep dialog open on error?
     // Current implementation relies on `inviteMember` potentially throwing, caught by context.
     // Let's ensure reset happens cleanly. We reset *after* the async call.
      form.reset(); // Reset form fields regardless of success/fail? Maybe better UX
      setIsOpen(false); // Let's close it regardless for V1. User can re-open if needed.
  };

  // Close dialog manually and reset form state
  const handleDialogClose = () => {
    setIsOpen(false);
    form.reset(); // Ensure form is reset when dialog is closed manually
  };

   // Handle open state change
  const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
      if (!open) {
          form.reset(); // Reset form if dialog is closed externally (e.g., clicking outside)
      }
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => e.preventDefault()}> {/* Prevents closing on clicking outside during submission potentially */}
        <DialogHeader>
          <DialogTitle>Invite New Member</DialogTitle>
          <DialogDescription>
            Enter the email address and select a role for the new member. They must have a CoHaven account.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 pb-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input placeholder="member@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Only allow inviting as co_owner or guest */}
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
                   <Button type="button" variant="outline" onClick={handleDialogClose}>Cancel</Button>
               </DialogClose>
              <Button type="submit" disabled={isLoadingAction}>
                {isLoadingAction ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Send Invite
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}