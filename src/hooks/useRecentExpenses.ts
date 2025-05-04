import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

// Add avatar_url
export type RecentExpenseWithUser = Tables<'expenses'> & {
  paid_by_profile: Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null;
};

export const useRecentExpenses = (propertyId: string | null | undefined, limit: number = 3) => {
  const [expenses, setExpenses] = useState<RecentExpenseWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (!propertyId || !session) { setExpenses([]); return; }

    const fetchRecentExpenses = async () => {
      setIsLoading(true); setError(null);
      try {
        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .select('*')
          .eq('property_id', propertyId)
          .order('date', { ascending: false })
          .limit(limit);

        if (expenseError) throw expenseError;
        if (!expenseData) { setExpenses([]); setIsLoading(false); return; };

        const userIds = Array.from(new Set(expenseData.map(e => e.paid_by).filter((id): id is string => id !== null)));

        let profilesMap = new Map<string, Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name' | 'avatar_url'>>();
        if (userIds.length > 0) {
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url') // Select avatar_url
                .in('id', userIds);

            if (profilesError) { console.warn("Could not fetch user profiles for expenses:", profilesError.message); }
            else if (profilesData) { profilesData.forEach(p => profilesMap.set(p.id, p)); }
        }

        const combinedData = expenseData.map(expense => ({
          ...expense,
          paid_by_profile: expense.paid_by ? profilesMap.get(expense.paid_by) || null : null,
        }));
        setExpenses(combinedData);
      } catch (err: any) { console.error("Error fetching recent expenses:", err); setError("Failed to load recent expenses."); setExpenses([]); }
      finally { setIsLoading(false); }
    };
    fetchRecentExpenses();
  }, [propertyId, limit, session]);
  return { expenses, isLoading, error };
};