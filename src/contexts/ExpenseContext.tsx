// src/contexts/ExpenseContext.tsx
// v31 - FIX: Correct update function name and remove p_property_id from payload.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useProperty } from "./PropertyContext.tsx";
import { useAuth } from "./AuthContext.tsx";
import { supabase } from "@/integrations/supabase/client";
import {
  Expense,
  ExpenseSplitRow,
  Profile,
  SplitMethodType,
  ExpenseCategoryType,
  PropertyMemberWithProfile,
  SplitStatus
} from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { PostgrestError } from "@supabase/supabase-js";

// --- Local Types ---
export interface EnrichedExpenseSplit extends ExpenseSplitRow { profile: Profile | null; }
export interface CombinedExpenseData extends Omit<Expense, 'splits'> {
    paid_by_profile: Profile | null;
    splits: EnrichedExpenseSplit[];
}
export interface ExpenseFormValues {
    date: Date; description: string; amount: number;
    category: ExpenseCategoryType;
    paid_by_user_id: string;
    split_method: SplitMethodType;
    notes?: string | null;
    receipt_url?: string | null;
    splits: Array<{ user_id: string; amount?: number | string | null; percentage?: number | string | null; shares?: number | string | null; status?: SplitStatus | string | null; }>;
}

// --- Context Type Definition ---
interface ExpenseContextType {
  expenses: Expense[]; expenseSplits: ExpenseSplitRow[]; combinedExpenses: CombinedExpenseData[];
  isLoadingExpenses: boolean; isLoadingSplits: boolean; errorExpenses: string | null; errorSplits: string | null;
  fetchExpensesAndSplits: (log?: boolean) => Promise<void>;
  addExpenseWithSplits: (expenseData: ExpenseFormValues) => Promise<{ data: Expense | null; error: PostgrestError | Error | null }>;
  updateExpenseWithSplits: (expenseId: string, expenseData: ExpenseFormValues) => Promise<{ data: Expense | null; error: PostgrestError | Error | null }>;
  deleteExpenseWithSplits: (expenseId: string) => Promise<{ error: PostgrestError | null }>;
  getReceiptUrl: (filePath: string) => Promise<string | null>;
}

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

export const ExpenseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { selectedProperty, isLoading: isPropertyLoading, propertyMembers } = useProperty();
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseSplits, setExpenseSplits] = useState<ExpenseSplitRow[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState<boolean>(false);
  const [isLoadingSplits, setIsLoadingSplits] = useState<boolean>(false);
  const [errorExpenses, setErrorExpenses] = useState<string | null>(null);
  const [errorSplits, setErrorSplits] = useState<string | null>(null);
  const propertyId = selectedProperty?.id; // Keep propertyId for fetch logic
  const userId = user?.id;

  // Fetch Logic (remains the same)
  const fetchExpensesAndSplits = useCallback(async (log = false) => { /* ... */
        if (!propertyId || !userId) { if (log) console.log("Ctx: Skip fetch"); setExpenses([]); setExpenseSplits([]); return; }
        if (log) console.log(`Ctx: Fetching for prop ${propertyId}`); setIsLoadingExpenses(true); setIsLoadingSplits(true); setErrorExpenses(null); setErrorSplits(null);
        try { const { data, error } = await supabase.from('expenses').select(`*, splits: expense_splits (*)`).eq('property_id', propertyId).order('date', { ascending: false }); if (error) throw error; if (log) console.log("Ctx: Fetched OK"); const fetchedExpenses: Expense[] = data?.map(e => { const { splits, ...rest } = e; return { ...rest, splits: [] }; }) || []; const fetchedSplits: ExpenseSplitRow[] = data?.flatMap(e => e.splits || []) || []; setExpenses(fetchedExpenses); setErrorExpenses(null); setExpenseSplits(fetchedSplits); setErrorSplits(null); }
        catch (err: any) { console.error("Ctx: Fetch Error:", err); setErrorExpenses(err.message); setErrorSplits(err.message); setExpenses([]); setExpenseSplits([]); toast({ variant: "destructive", title: "Error Loading Expenses", description: err.message }); }
        finally { setIsLoadingExpenses(false); setIsLoadingSplits(false); }
   }, [propertyId, userId, toast]);
  useEffect(() => { /* ... fetch effect ... */
        if (!isPropertyLoading && propertyId && userId) { console.log("Ctx: Prop/User ready, fetch."); fetchExpensesAndSplits(true); } else if (!isPropertyLoading) { console.log("Ctx: Prop/User not ready, clear."); setExpenses([]); setExpenseSplits([]); setErrorExpenses(null); setErrorSplits(null); }
  }, [propertyId, userId, isPropertyLoading, fetchExpensesAndSplits]);
  const combinedExpenses = useMemo((): CombinedExpenseData[] => { /* ... remains same ... */
        if (!Array.isArray(propertyMembers)) { return []; } const members = propertyMembers as PropertyMemberWithProfile[]; const memberMap = new Map<string, Profile | null>(); members.forEach(member => { memberMap.set(member.user_id, member.profile || null); }); return expenses.map(exp => { const expenseSplitsForThisExpense = expenseSplits.filter(split => split.expense_id === exp.id); const enrichedSplits: EnrichedExpenseSplit[] = expenseSplitsForThisExpense.map(split => ({ ...split, profile: split.user_id ? memberMap.get(split.user_id) ?? null : null })); const paidByProfile = exp.paid_by ? memberMap.get(exp.paid_by) ?? null : null; const combinedData: CombinedExpenseData = { ...exp, paid_by_profile: paidByProfile, splits: enrichedSplits, }; return combinedData; });
  }, [expenses, expenseSplits, propertyMembers]);
  const getReceiptUrl = useCallback(async (filePath: string): Promise<string | null> => { /* ... remains same ... */
        if (!filePath) return null; try { console.warn("getReceiptUrl: Not implemented."); toast({ title: "Info", description: "Receipt viewing disabled." }); return Promise.resolve(null); } catch (error: any) { console.error("Error getting receipt URL:", error); toast({ variant: "destructive", title: "Error Getting Receipt", description: error.message }); return null; }
  }, [toast]);

  // Add Expense Function (remains same as v30)
  const addExpenseWithSplits = async (expenseData: ExpenseFormValues): Promise<{ data: Expense | null; error: PostgrestError | Error | null }> => { /* ... */
        if (!propertyId) return { data: null, error: new Error("No property selected") }; if (!user?.id) return { data: null, error: new Error("User not authenticated") };
        const rpcPayload = { p_property_id: propertyId, p_paid_by_user_id: expenseData.paid_by_user_id, p_date: expenseData.date.toISOString().split('T')[0], p_description: expenseData.description, p_amount: Number(expenseData.amount), p_category: expenseData.category, p_split_method: expenseData.split_method, p_notes: expenseData.notes || null, p_splits: expenseData.splits.map(s => { if (s.user_id == null || s.amount == null || s.status == null) { throw new Error("Internal: Invalid split data for DB."); } return { user_id: s.user_id, amount: Number(s.amount), status: String(s.status) }; }) };
        console.log("Calling add_expense_and_splits with payload:", rpcPayload); try { const { error } = await supabase.rpc('add_expense_and_splits', rpcPayload); if (error) throw error; await fetchExpensesAndSplits(true); toast({ title: "Expense Added" }); return { data: null, error: null }; } catch (err: any) { console.error("Error adding expense:", err); const message = err.message || "Unknown add error."; toast({ variant: "destructive", title: "Error adding expense", description: message }); return { data: null, error: err }; }
   };

  // --- Update Expense Function - CORRECTED ---
  const updateExpenseWithSplits = async (expenseId: string, expenseData: ExpenseFormValues): Promise<{ data: Expense | null; error: PostgrestError | Error | null }> => {
    if (!expenseId) return { data: null, error: new Error("No expense ID provided for update.") }; // Add check for expenseId
    if (!user?.id) return { data: null, error: new Error("User not authenticated") }; // Added user check

    // Construct payload matching the CORRECT function signature
    const rpcPayload = {
        p_expense_id: expenseId,
        // p_property_id: propertyId, // REMOVED - Not expected by the function
        p_paid_by_user_id: expenseData.paid_by_user_id,
        p_date: expenseData.date.toISOString().split('T')[0],
        p_description: expenseData.description,
        p_amount: Number(expenseData.amount),
        p_category: expenseData.category,
        p_split_method: expenseData.split_method,
        p_notes: expenseData.notes || null,
        p_splits: expenseData.splits.map(s => {
            if (s.user_id == null || s.amount == null || s.status == null) {
                console.error("Error in context: Null value found in split before sending to DB (update):", s);
                throw new Error("Internal error: Invalid split data prepared for database update.");
            }
            return {
                user_id: s.user_id,
                amount: Number(s.amount),
                status: String(s.status)
            };
        })
    };

    // Use the CORRECT function name
    const functionName = 'update_expense_and_recalculate_splits';
    console.log(`Calling ${functionName} with payload:`, rpcPayload);

    try {
        // Call the CORRECT RPC function
        const { error } = await supabase.rpc(functionName, rpcPayload);
        if (error) {
            console.error(`Supabase RPC Error (${functionName}):`, error);
            // More specific error handling if needed based on function behavior
             if (error.code === 'PGRST202') { throw new Error(`DB function '${functionName}' not found or signature mismatch. Verify params. Error: ${error.message}`); }
             if (error.code === 'P0001') { throw new Error(`DB function '${functionName}' validation failed: ${error.message}`);} // Example for user-defined errors
            throw error;
        }
        await fetchExpensesAndSplits(true); // Refresh data on success
        toast({ title: "Expense Updated" });
        return { data: null, error: null };
    } catch (err: any) {
        console.error("Error updating expense:", err);
        toast({ variant: "destructive", title: "Error updating expense", description: err.message });
        return { data: null, error: err };
    }
};

  // Delete Expense Function (remains same)
  const deleteExpenseWithSplits = async (expenseId: string): Promise<{ error: PostgrestError | null }> => { /* ... */
        if (!expenseId) { return { error: new PostgrestError({ message: "No expense ID", details: "", hint: "", code: "DL001" }) }; } console.log(`Attempting delete: ${expenseId}`); try { const { error } = await supabase.rpc('delete_expense_and_splits', { p_expense_id: expenseId }); if (error) { console.error("Delete RPC Error:", error); if (error.code === 'PGRST202') { throw new Error(`DB function 'delete_expense_and_splits' not found/mismatch. Verify params. Error: ${error.message}`); } throw error; } console.log(`Expense ${expenseId} deleted.`); toast({ title: "Expense Deleted" }); await fetchExpensesAndSplits(false); return { error: null }; } catch (err: any) { console.error("Error deleting expense:", err); toast({ variant: "destructive", title: "Error Deleting Expense", description: err.message }); return { error: err instanceof PostgrestError ? err : new PostgrestError({ message: err.message, details: "", hint: "", code: "DL002" }) }; }
   };

  // Context Value Definition (remains same)
  const value: ExpenseContextType = useMemo(() => ({ /* ... */
        expenses, expenseSplits, combinedExpenses, isLoadingExpenses, isLoadingSplits, errorExpenses, errorSplits, fetchExpensesAndSplits, addExpenseWithSplits, updateExpenseWithSplits, deleteExpenseWithSplits, getReceiptUrl
   }), [ /* ... dependencies ... */
        expenses, expenseSplits, combinedExpenses, isLoadingExpenses, isLoadingSplits, errorExpenses, errorSplits, fetchExpensesAndSplits, addExpenseWithSplits, updateExpenseWithSplits, deleteExpenseWithSplits, getReceiptUrl
   ]);

  return ( <ExpenseContext.Provider value={value}>{children}</ExpenseContext.Provider> );
};

// Consumer Hook (remains same)
export const useExpenses = (): ExpenseContextType => { /* ... */
    const context = useContext(ExpenseContext); if (context === undefined) { throw new Error('useExpenses must be used within an ExpenseProvider'); } return context;
};