import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { parseISO, format } from 'date-fns'; // Ensure format is imported

// Define the aggregated activity item structure
type ProfileInfo = Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null;

// Structure for the final aggregated item
export type AggregatedActivityItem = {
  id: string; // Unique composite ID like "booking-uuid"
  type: 'booking' | 'expense' | 'maintenance';
  created_at: string; // ISO string for sorting
  timestamp: Date; // Date object for easier sorting/display if needed
  description: string;
  user_profile: ProfileInfo;
};

// Intermediate structure before profile mapping
type IntermediateActivityItem = {
    id: string;
    type: 'booking' | 'expense' | 'maintenance';
    created_at: string;
    timestamp: Date;
    description: string;
    user_id: string | null; // Temporary field to hold user ID for profile fetching
};


// Helper functions (consider moving to utils if used elsewhere)
const formatCurrencySimple = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const formatDateSimple = (dateStr: string) => { try { return format(parseISO(dateStr), 'PP'); } catch { return "Invalid Date"; } };
const formatDateRangeSimple = (startStr: string, endStr: string) => { try {const s=parseISO(startStr); const e=parseISO(endStr); return `${format(s,'MMM d')} - ${format(e, s.getMonth() === e.getMonth() ? 'd' : 'MMM d')}`;} catch { return "Invalid Range"; } };

export const useRecentActivity = (propertyId: string | null | undefined, limit: number = 7) => {
  const [activity, setActivity] = useState<AggregatedActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (!propertyId || !session) {
      setActivity([]);
      return;
    }

    const fetchRecentActivity = async () => {
      setIsLoading(true);
      setError(null);
      // Use the Intermediate type for the combined array before profile mapping
      let combinedActivity: IntermediateActivityItem[] = [];
      const allUserIds = new Set<string>();

      try {
        // 1. Fetch Recent Bookings
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select('id, created_at, start_date, end_date, user_id')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (bookingsError) console.warn("Error fetching bookings for activity:", bookingsError.message);
        else if (bookingsData) {
            bookingsData.forEach(b => {
                // Construct the full IntermediateActivityItem
                combinedActivity.push({
                    id: `booking-${b.id}`,
                    type: 'booking',
                    created_at: b.created_at,
                    timestamp: parseISO(b.created_at),
                    description: `booked stay ${formatDateRangeSimple(b.start_date, b.end_date)}`,
                    user_id: b.user_id
                });
                if (b.user_id) allUserIds.add(b.user_id);
            });
        }

        // 2. Fetch Recent Expenses
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('id, created_at, description, amount, paid_by, date') // Added date for potential future use
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (expensesError) console.warn("Error fetching expenses for activity:", expensesError.message);
        else if (expensesData) {
            expensesData.forEach(e => {
                // Construct the full IntermediateActivityItem
                combinedActivity.push({
                    id: `expense-${e.id}`,
                    type: 'expense',
                    created_at: e.created_at,
                    timestamp: parseISO(e.created_at),
                    description: `added expense '${e.description || 'Untitled'}' (${formatCurrencySimple(e.amount || 0)})`,
                    user_id: e.paid_by
                });
                if (e.paid_by) allUserIds.add(e.paid_by);
            });
        }

        // 3. Fetch Recent Maintenance Tasks
        const { data: tasksData, error: tasksError } = await supabase
          .from('maintenance_tasks')
          .select('id, created_at, title, status, created_by')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (tasksError) console.warn("Error fetching maintenance for activity:", tasksError.message);
        else if (tasksData) {
            tasksData.forEach(t => {
                 // Construct the full IntermediateActivityItem
                 combinedActivity.push({
                    id: `maintenance-${t.id}`,
                    type: 'maintenance',
                    created_at: t.created_at,
                    timestamp: parseISO(t.created_at),
                    description: `created task '${t.title || 'Untitled'}' (${t.status || 'Unknown'})`,
                    user_id: t.created_by
                });
                if (t.created_by) allUserIds.add(t.created_by);
            });
        }

        // 4. Fetch Profiles for all involved users
        let profilesMap = new Map<string, ProfileInfo>();
        if (allUserIds.size > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', Array.from(allUserIds));

          if (profilesError) console.warn("Could not fetch profiles for activity feed:", profilesError.message);
          else if (profilesData) {
            profilesData.forEach(p => profilesMap.set(p.id, p));
          }
        }

        // 5. Sort combined activities by timestamp and limit
        const sortedIntermediateActivity = combinedActivity
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // Sort by Date object
            .slice(0, limit);

        // 6. Map to the final AggregatedActivityItem structure, adding profile and removing user_id
        const finalActivity: AggregatedActivityItem[] = sortedIntermediateActivity.map(item => {
             // Destructure to remove user_id, keep the rest
            const { user_id, ...restOfItem } = item;
            return {
                ...restOfItem, // Spread properties like id, type, created_at, timestamp, description
                user_profile: user_id ? profilesMap.get(user_id) || null : null, // Add profile info
            };
        });


        setActivity(finalActivity);

      } catch (err: any) {
        console.error("Error fetching aggregated activity:", err);
        setError("Failed to load recent activity.");
        setActivity([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentActivity();

  }, [propertyId, limit, session]);

  return { activity, isLoading, error };
};