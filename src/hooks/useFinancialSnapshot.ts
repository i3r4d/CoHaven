import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, formatISO, format } from 'date-fns'; // <<< Added 'format' here

export type FinancialSnapshotData = {
  totalExpensesThisMonth: number;
  monthName: string;
};

export const useFinancialSnapshot = (propertyId: string | null | undefined) => {
  const [data, setData] = useState<FinancialSnapshotData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (!propertyId || !session) {
      setData(null);
      return;
    }

    const fetchSnapshot = async () => {
      setIsLoading(true);
      setError(null);
      setData(null); // Reset data on new fetch

      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      // const monthName = formatISO(now, { representation: 'date' }).substring(0, 7); // We'll use the formatted name below

      try {
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('amount')
          .eq('property_id', propertyId)
          .gte('date', formatISO(monthStart, { representation: 'date' }))
          .lte('date', formatISO(monthEnd, { representation: 'date' }));

        if (expensesError) throw expensesError;

        const total = expensesData?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;

        setData({
            totalExpensesThisMonth: total,
            monthName: format(monthStart, 'MMMM yyyy') // Now 'format' is recognized
        });

      } catch (err: any) {
        console.error("Error fetching financial snapshot:", err);
        setError("Failed to load financial snapshot.");
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSnapshot();

  }, [propertyId, session]);

  return { financialData: data, isLoading, error };
};