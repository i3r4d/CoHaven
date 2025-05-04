// src/contexts/BookingContext.tsx
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
  useMemo // Import useMemo
} from 'react';
import { useAuth } from './AuthContext';
import { useProperty } from './PropertyContext'; // Import useProperty
import { supabase } from '@/integrations/supabase/client';
import {
  Booking,
  Profile,
  BookingContextType,
  DbResult,
  TablesInsert,
  TablesUpdate,
  BookingRow,
  MemberRole, // Import MemberRole
  PropertyMemberWithProfile // Import PropertyMemberWithProfile
} from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { PostgrestError } from '@supabase/supabase-js';

// Create the context with undefined default value
const BookingContext = createContext<BookingContextType | undefined>(undefined);

// Define props for the provider component
type BookingProviderProps = {
  children: ReactNode;
};

// Define the provider component
export const BookingProvider: React.FC<BookingProviderProps> = ({ children }) => {
  const { user } = useAuth();
  // --- START: Get necessary data from PropertyContext ---
  const { selectedProperty, propertyMembers } = useProperty();
  // --- END: Get necessary data from PropertyContext ---
  const { toast } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // --- START: Derive current user's role (needed for addBooking) ---
   const currentUserRole: MemberRole | null = useMemo(() => {
      if (!user || !propertyMembers || propertyMembers.length === 0) {
          return null;
      }
      // Ensure we are dealing with the enriched type
      const currentUserMember = propertyMembers.find(
          (member: PropertyMemberWithProfile) => member.user_id === user.id
      );
      return currentUserMember?.role || null;
  }, [user, propertyMembers]);
  // --- END: Derive current user's role ---


  // Function to fetch bookings for the selected property
  const fetchBookings = useCallback(async () => {
    if (!selectedProperty || !user) {
      setBookings([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('property_id', selectedProperty.id);

      if (bookingError) throw bookingError;

      const userIds = Array.from(
        new Set((bookingData || []).map((booking) => booking.user_id))
      );

      let profiles: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_url' | 'email'>[] = [];
      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url, email')
          .in('id', userIds);

        if (profileError) {
            console.warn('BookingContext: Failed to fetch profiles, proceeding without them.', profileError);
        } else {
            profiles = profileData || [];
        }
      }

      const bookingsWithProfiles: Booking[] = (bookingData || []).map(
        (booking: BookingRow) => {
          const profile = profiles.find((p) => p.id === booking.user_id);
          const fullBooking: Booking = {
            ...booking,
            profile: profile || null,
          };
          return fullBooking;
        }
      );

      setBookings(bookingsWithProfiles);

    } catch (err: any) {
      console.error('BookingContext: Error fetching bookings:', err);
      const fetchError = err instanceof PostgrestError
          ? new Error(`Database error: ${err.message}`)
          : new Error('Failed to fetch bookings');
      setError(fetchError);
      toast({
        title: 'Error Fetching Bookings',
        description: fetchError.message || 'Could not load booking data.',
        variant: 'destructive',
      });
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProperty, user, toast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Function to add a new booking
  const addBooking = useCallback(async (
    bookingData: Omit<TablesInsert<'bookings'>, 'id' | 'created_at' | 'user_id' | 'status' | 'property_id'> & { status?: string }
  ): Promise<DbResult<Booking>> => {
    // Check currentUserRole defined above
    if (!user || !selectedProperty || currentUserRole === null) {
      const err = new Error('User, property, or user role not available');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return { data: null, error: err };
    }

    // Auto-approve if owner OR co_owner
    const isPrivilegedUser = currentUserRole === 'owner' || currentUserRole === 'co_owner';
    const initialStatus = isPrivilegedUser ? 'approved' : 'pending';
    const toastMessage = isPrivilegedUser ? 'Booking created successfully.' : 'Booking requested successfully.';

    const dataToInsert: TablesInsert<'bookings'> = {
      ...bookingData,
      property_id: selectedProperty.id,
      user_id: user.id,
      status: bookingData.status || initialStatus, // Use calculated initialStatus
    };

    try {
      const { data: newBookingRow, error } = await supabase
        .from('bookings')
        .insert(dataToInsert)
        .select()
        .single();

      if (error) throw error;
      if (!newBookingRow) throw new Error('Booking created but data not returned.');

      let profileData: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_url' | 'email'> | null = null;
      try {
          const { data: fetchedProfile, error: profileError } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, avatar_url, email')
              .eq('id', user.id)
              .maybeSingle();

          if (profileError) {
              console.warn("Could not fetch profile for new booking", profileError);
          } else {
              profileData = fetchedProfile;
          }
      } catch (profileFetchErr) {
          console.warn("Error fetching profile for new booking", profileFetchErr);
      }

      const newBooking: Booking = {
        ...newBookingRow,
        profile: profileData,
      };

      setBookings((prev) => [...prev, newBooking]);
      toast({ title: 'Success', description: toastMessage }); // Use dynamic toast message
      return { data: newBooking, error: null };

    } catch (err: any) {
      console.error('BookingContext: Error adding booking:', err);
      const addError = err instanceof PostgrestError ? new Error(`Database error: ${err.message}`) : new Error('Failed to add booking');
      toast({ title: 'Error', description: addError.message, variant: 'destructive' });
      return { data: null, error: addError };
    }
  }, [user, selectedProperty, toast, currentUserRole]); // Add currentUserRole dependency

  // Function to update an existing booking
  const updateBooking = useCallback(async (
    bookingId: string,
    bookingData: Partial<TablesUpdate<'bookings'>>
  ): Promise<DbResult<Booking>> => {
     if (!user) {
      const err = new Error('User not authenticated');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return { data: null, error: err };
    }

    const { user_id, property_id, ...updatePayload } = bookingData;
     if (user_id || property_id) {
        console.warn("BookingContext: Attempted to update user_id or property_id. These fields should not be changed.");
     }
     if (Object.keys(updatePayload).length === 0) {
        console.warn("BookingContext: Update called with no valid fields to update.");
        const err = new Error("No valid fields provided for update.");
        return { data: null, error: err };
     }

    try {
      const { data: updatedBookingRow, error } = await supabase
        .from('bookings')
        .update(updatePayload)
        .eq('id', bookingId)
        .select()
        .single();

      if (error) throw error;
      if (!updatedBookingRow) throw new Error('Booking updated but data not returned.');

      const existingBooking = bookings.find(b => b.id === bookingId);
      let profile = existingBooking?.profile;

      if (!profile && updatedBookingRow.user_id) {
          try {
              const { data: profileData, error: profileError } = await supabase
                  .from('profiles')
                  .select('id, first_name, last_name, avatar_url, email')
                  .eq('id', updatedBookingRow.user_id)
                  .maybeSingle();

              if (!profileError && profileData) {
                  profile = profileData;
              } else if (profileError) {
                   console.warn(`Could not fetch profile for updated booking user ${updatedBookingRow.user_id}`, profileError);
              }
          } catch (profileFetchErr) {
              console.warn(`Error fetching profile for updated booking user ${updatedBookingRow.user_id}`, profileFetchErr);
          }
      }

      const updatedBooking: Booking = {
        ...updatedBookingRow,
        profile: profile || null,
      };

      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? updatedBooking : b))
      );
      toast({ title: 'Success', description: 'Booking updated successfully.' });
      return { data: updatedBooking, error: null };

    } catch (err: any) {
      console.error('BookingContext: Error updating booking:', err);
      const updateError = err instanceof PostgrestError ? new Error(`Database error: ${err.message}`) : new Error('Failed to update booking');
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
      return { data: null, error: updateError };
    }
  }, [user, toast, bookings]);

  // Function to delete a booking
  const deleteBooking = useCallback(async (bookingId: string): Promise<DbResult<null>> => {
     if (!user) {
      const err = new Error('User not authenticated');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return { data: null, error: err };
    }

    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (error) throw error;

      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      toast({ title: 'Success', description: 'Booking deleted successfully.' });
      return { data: null, error: null };

    } catch (err: any) {
      console.error('BookingContext: Error deleting booking:', err);
      const deleteError = err instanceof PostgrestError ? new Error(`Database error: ${err.message}`) : new Error('Failed to delete booking');
      toast({ title: 'Error', description: deleteError.message, variant: 'destructive' });
      return { data: null, error: deleteError };
    }
  }, [user, toast]);


  // Function to update only the status
  const updateBookingStatus = useCallback(async (
    bookingId: string,
    status: string
  ): Promise<DbResult<Booking>> => {
    // Relies on updateBooking's RLS checks
    return updateBooking(bookingId, { status });
  }, [updateBooking]);


  // Helper function to get a specific booking by ID
  const getBookingById = useCallback((bookingId: string): Booking | undefined => {
    return bookings.find(b => b.id === bookingId);
  }, [bookings]);


  // Assemble the context value
  const contextValue: BookingContextType = {
    bookings,
    isLoading,
    error,
    fetchBookings,
    addBooking,
    updateBooking,
    deleteBooking,
    getBookingById,
    updateBookingStatus,
  };

  // Provide the context value to children components
  return (
    <BookingContext.Provider value={contextValue}>
      {children}
    </BookingContext.Provider>
  );
};

// Custom hook to easily consume the BookingContext
export const useBooking = (): BookingContextType => {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};