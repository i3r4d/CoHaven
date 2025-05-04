import React, { useState } from 'react';
import { useCoOwner } from '@/contexts/CoOwnerContext';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2 } from 'lucide-react';

interface ConfirmRemoveMemberDialogProps {
  trigger: React.ReactNode; // The element that opens the dialog (e.g., DropdownMenuItem)
  memberId: string; // The property_members.id of the member to remove
  memberName: string; // The name of the member for display
}

export function ConfirmRemoveMemberDialog({ trigger, memberId, memberName }: ConfirmRemoveMemberDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { removeMember, isLoadingAction } = useCoOwner();

  const handleRemoveConfirm = async () => {
    await removeMember(memberId);
    // Context handles toast messages
    // Dialog will close automatically on action completion unless prevented
    // No need to manually set isOpen(false) here typically for AlertDialogAction
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently remove{' '}
            <span className="font-semibold">{memberName}</span> from this property's
            membership list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoadingAction}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemoveConfirm}
            disabled={isLoadingAction}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90" // Destructive styling
          >
            {isLoadingAction ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove Member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}