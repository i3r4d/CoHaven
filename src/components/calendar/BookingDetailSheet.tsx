// src/components/calendar/BookingDetailSheet.tsx
import React, { useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Booking, MemberRole, PropertyMemberWithProfile } from "@/integrations/supabase/types";
import { formatDate, formatCategoryName } from '@/lib/utils';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { UserCircle, CheckCircle, XCircle, Loader2, Edit, Trash2 } from 'lucide-react'; // Added Edit, Trash2

import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/hooks/use-toast';


interface BookingDetailSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null | undefined;
  onEdit?: (booking: Booking) => void; // <-- ADDED: Callback for edit action
}

// (getStatusBadgeVariant and formatBookerName remain the same)
const getStatusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' | null | undefined => {
    switch (status?.toLowerCase()) {
        case 'approved':
        case 'confirmed':
            return 'default';
        case 'pending':
            return 'secondary';
        case 'rejected':
        case 'cancelled':
            return 'destructive';
        default:
            return 'outline';
    }
};

const formatBookerName = (booking: Booking | null | undefined): string => {
    if (!booking?.profile) return 'Unknown User';
    return `${booking.profile.first_name || ''} ${booking.profile.last_name || ''}`.trim() || booking.profile.email || 'User';
};


export const BookingDetailSheet: React.FC<BookingDetailSheetProps> = ({
  isOpen,
  onOpenChange,
  booking,
  onEdit, // <-- Destructure onEdit prop
}) => {
  const { user } = useAuth();
  const { propertyMembers } = useProperty();
  const { updateBookingStatus, deleteBooking } = useBooking(); // <-- Added deleteBooking
  const { toast } = useToast();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // <-- ADDED: State for delete loading

  const currentUserRole: MemberRole | null = useMemo(() => {
      if (!user || !propertyMembers || propertyMembers.length === 0) {
          return null;
      }
      const currentUserMember = propertyMembers.find(
          (member: PropertyMemberWithProfile) => member.user_id === user.id
      );
      return currentUserMember?.role || null;
  }, [user, propertyMembers]);

  // Calculate if the current user is the one who made the booking
  const isCurrentUserBooker = useMemo(() => {
    return user?.id === booking?.user_id;
  }, [user, booking]);


  if (!booking) {
    return null;
  }

  const formattedStartDate = booking.start_date ? formatDate(booking.start_date) : 'N/A';
  const formattedEndDate = booking.end_date ? formatDate(booking.end_date) : 'N/A';
  const formattedCreatedAt = booking.created_at ? format(new Date(booking.created_at), 'PPP p') : 'N/A';
  const bookerName = formatBookerName(booking);
  const purposeText = booking.purpose || 'Not specified';

  const canApproveReject =
    booking.status === 'pending' &&
    (currentUserRole === 'owner' || currentUserRole === 'co_owner') &&
    user?.id !== booking.user_id;

  // (handleStatusUpdate remains the same)
  const handleStatusUpdate = async (newStatus: 'approved' | 'rejected') => {
    if (!booking) return;
    setIsUpdatingStatus(true);
    try {
      const result = await updateBookingStatus(booking.id, newStatus);
      if (result.error) {
        toast({
          title: 'Error Updating Status',
          description: result.error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Status Updated',
          description: `Booking has been ${newStatus}.`,
        });
        // Optionally close sheet after approval/rejection? Depends on desired UX
        // onOpenChange(false);
      }
    } catch (error: any) {
       toast({
         title: 'Error',
         description: error.message || 'An unexpected error occurred.',
         variant: 'destructive',
       });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // --- ADDED: Handler for Delete Action ---
  const handleDelete = async () => {
      if (!booking || !isCurrentUserBooker) return; // Extra safety check

      const confirmed = window.confirm(`Are you sure you want to delete your booking from ${formattedStartDate} to ${formattedEndDate}?`);
      if (!confirmed) return;

      setIsDeleting(true);
      try {
          const result = await deleteBooking(booking.id);
          if (result.error) {
              toast({
                  title: 'Error Deleting Booking',
                  description: result.error.message,
                  variant: 'destructive',
              });
          } else {
              toast({
                  title: 'Booking Deleted',
                  description: 'Your booking has been successfully deleted.',
              });
              onOpenChange(false); // Close the sheet on successful delete
          }
      } catch (error: any) {
          toast({
              title: 'Error',
              description: error.message || 'An unexpected error occurred while deleting.',
              variant: 'destructive',
          });
      } finally {
          setIsDeleting(false);
      }
  };

  // --- ADDED: Handler for Edit Action ---
  const handleEdit = () => {
      if (!booking || !isCurrentUserBooker || !onEdit) return;
      onEdit(booking); // Call the callback passed from CalendarPage
      onOpenChange(false); // Close this sheet to open the dialog
  };


  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-[90vw] flex flex-col">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="text-2xl text-navy-900">Booking Details</SheetTitle>
          <SheetDescription>
            Detailed information for the booking by {bookerName}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1 space-y-6">
          {/* Booker Info */}
          <div className="flex items-center space-x-3">
            {booking.profile?.avatar_url ? (
                <img
                    src={booking.profile.avatar_url}
                    alt={bookerName}
                    className="h-12 w-12 rounded-full object-cover border border-slate-200"
                />
            ) : (
                <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300">
                    <UserCircle className="h-6 w-6 text-slate-500" />
                </div>
            )}
             <div>
              <p className="text-sm font-medium text-gray-500">Booked By</p>
              <p className="text-lg font-semibold text-navy-900">{bookerName}</p>
              {booking.profile?.email && <p className="text-xs text-muted-foreground">{booking.profile.email}</p>}
            </div>
          </div>

          {/* Booking Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 text-sm">
            <div>
              <p className="font-medium text-gray-500">Start Date</p>
              <p className="font-semibold text-navy-800">{formattedStartDate}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">End Date</p>
              <p className="font-semibold text-navy-800">{formattedEndDate}</p>
            </div>
             <div className="sm:col-span-2">
              <p className="font-medium text-gray-500">Purpose</p>
              <p className="font-semibold text-navy-800">{purposeText}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Number of Guests</p>
              <p className="font-semibold text-navy-800">{booking.num_guests ?? 'N/A'}</p>
            </div>
             <div>
              <p className="font-medium text-gray-500">Status</p>
              <Badge variant={getStatusBadgeVariant(booking.status)} className="capitalize">
                {formatCategoryName(booking.status || 'Unknown')}
              </Badge>
            </div>
            <div className="sm:col-span-2">
               <p className="font-medium text-gray-500">Date Booked</p>
              <p className="font-semibold text-navy-800 text-xs">{formattedCreatedAt}</p>
            </div>
          </div>

           {/* Conditional Approval Buttons */}
           {canApproveReject && (
             <div className="pt-4 border-t mt-4">
                <p className="text-sm font-medium text-gray-600 mb-3">Actions (Admin)</p>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                        onClick={() => handleStatusUpdate('approved')}
                        disabled={isUpdatingStatus}
                    >
                        {isUpdatingStatus ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        Approve
                    </Button>
                     <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => handleStatusUpdate('rejected')}
                        disabled={isUpdatingStatus}
                     >
                        {isUpdatingStatus ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <XCircle className="mr-2 h-4 w-4" />
                        )}
                         Reject
                    </Button>
                </div>
             </div>
           )}

        </div> {/* End of scrollable content */}

        <SheetFooter className="pt-4 border-t flex flex-col sm:flex-row sm:justify-between items-center">
           {/* --- ADDED: Edit and Delete Buttons for Booker --- */}
           <div className="flex gap-2 order-last sm:order-first mt-4 sm:mt-0">
              {isCurrentUserBooker && (
                 <>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEdit}
                        disabled={isDeleting || isUpdatingStatus} // Disable if any action is in progress
                    >
                        <Edit className="mr-2 h-4 w-4" /> Edit
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isDeleting || isUpdatingStatus}
                    >
                        {isDeleting ? (
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                         Delete
                     </Button>
                 </>
              )}
           </div>

          {/* --- FIX: Added asChild={true} to fix nesting --- */}
          <SheetClose asChild={true}>
            <Button variant="outline" className="w-full sm:w-auto">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};