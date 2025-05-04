import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

// Add avatar_url to the profile type
export type UpcomingBookingWithUser = Tables<'bookings'> & {
  profile: Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null;
};

export const useUpcomingBookings = (propertyId: string | null | undefined, limit: number = 3) => {
  const [bookings, setBookings] = useState<UpcomingBookingWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (!propertyId || !session) {
      setBookings([]);
      return;
    }

    const fetchUpcomingBookings = async () => {
      setIsLoading(true);
      setError(null);
      const today = new Date().toISOString().split('T')[0];

      try {
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('*') // Select all booking fields
          .eq('property_id', propertyId)
          .gte('start_date', today)
          .order('start_date', { ascending: true })
          .limit(limit);

        if (bookingError) throw bookingError;
        if (!bookingData) { setBookings([]); setIsLoading(false); return; };

        const userIds = Array.from(new Set(bookingData.map(b => b.user_id).filter(id => id)));

        // Fetch profiles including avatar_url
        let profilesMap = new Map<string, Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name' | 'avatar_url'>>();
        if (userIds.length > 0) {
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url') // Select avatar_url
                .in('id', userIds);

            if (profilesError) { console.warn("Could not fetch user profiles for bookings:", profilesError.message); }
            else if (profilesData) { profilesData.forEach(p => profilesMap.set(p.id, p)); }
        }

        const combinedData = bookingData.map(booking => ({
          ...booking,
          profile: profilesMap.get(booking.user_id) || null,
        }));

        setBookings(combinedData);

      } catch (err: any) {
        console.error("Error fetching upcoming bookings:", err);
        setError("Failed to load upcoming bookings.");
        setBookings([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpcomingBookings();
  }, [propertyId, limit, session]);

  return { bookings, isLoading, error };
};