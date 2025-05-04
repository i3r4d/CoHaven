// src/contexts/RecurringExpenseContext.tsx
// Corrected: Removed 'Constants' import and replaced its usage with SplitMethod enum.
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { format, isValid as isValidDate, startOfDay, parseISO } from 'date-fns';

// Corrected Import: Removed Constants
import {
    Database,
    Profile,
    PropertyMemberWithProfile,
    RecurringExpense,
    RecurringExpenseRow,
    RecurringExpenseFormData,
    ExpenseCategory, // Keep ExpenseCategory if used, otherwise remove? Assume needed by formData
    SplitMethod, // Use this enum
    Frequency,   // Use this enum
    RecurringExpenseCategory, // Added: Ensure this specific enum is imported for category field
    Json,
} from '@/integrations/supabase/types';

// Helper: Format Currency (Unchanged)
const formatCurrency = (amount: number | null | undefined): string => {
    if (amount == null || typeof amount !== 'number' || isNaN(amount)) { return '$0.00'; }
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }
    catch (e) { console.error("Error formatting currency:", amount, e); return 'N/A'; }
};

// Helper: Build JSON object for split_details column based on form data
const buildSplitDetailsJson = (
    formData: RecurringExpenseFormData,
    payerId: string | null // payerId might not be needed here if not used in logic
): Json => {
    const totalAmount = formData.amount;

    // Corrected: Use SplitMethod enum
    switch (formData.split_method) {
        case SplitMethod.Equal:
            // Store minimal info, calculation happens when generating expense
            return { type: SplitMethod.Equal };

        case SplitMethod.Percentage:
             if (!formData.percentage_splits) throw new Error("Percentages missing for percentage split.");
             let totalPercentage = 0;
             const percentageSplits: Record<string, number> = {};
             Object.entries(formData.percentage_splits).forEach(([userId, percentageInput]) => {
                 // Validate and parse percentage
                 const percentage = typeof percentageInput === 'number' ? percentageInput : parseFloat(percentageInput || '0');
                 if (isNaN(percentage) || percentage < 0) throw new Error(`Invalid percentage input: ${percentageInput}`);
                 percentageSplits[userId] = percentage; // Store the raw percentage
                 totalPercentage += percentage;
             });
             // Validate total percentage
             if (Math.abs(totalPercentage - 100) > 0.01) {
                 throw new Error(`Percentages must sum to 100%. Total: ${totalPercentage.toFixed(2)}%`);
             }
             // Store the validated percentages
             return { type: SplitMethod.Percentage, splits: percentageSplits };

        case SplitMethod.Custom:
             if (!formData.custom_splits) throw new Error("Custom amounts missing for custom split.");
             let customTotal = 0;
             const customSplits: Record<string, number> = {};
             Object.entries(formData.custom_splits).forEach(([userId, amountInput]) => {
                  // Validate and parse amount
                  const amount = typeof amountInput === 'number' ? amountInput : parseFloat(amountInput || '0');
                  if (isNaN(amount) || amount < 0) throw new Error(`Invalid custom amount input: ${amountInput}`);
                  const numericAmount = parseFloat(amount.toFixed(2)); // Ensure 2 decimal places
                  customSplits[userId] = numericAmount; // Store the specific amount
                  customTotal += numericAmount;
             });
             // Validate total amount
             if (Math.abs(customTotal - totalAmount) > 0.01) {
                 throw new Error(`Custom amounts must sum to ${formatCurrency(totalAmount)}. Total: ${formatCurrency(customTotal)}`);
             }
             // Store the validated amounts
             return { type: SplitMethod.Custom, splits: customSplits };

        // Corrected: Use enum (assuming PayerOnly exists)
        case SplitMethod.PayerOnly:
            // No specific splits needed, just the type
            return { type: SplitMethod.PayerOnly };

        default:
            // Use exhaustive check pattern for safety
            const _exhaustiveCheck: never = formData.split_method;
            console.error("Unsupported split method encountered in buildSplitDetailsJson:", _exhaustiveCheck);
            throw new Error(`Unsupported split method for recurring expense: ${formData.split_method}`);
    }
};


// --- Context Definition (Unchanged) ---
interface RecurringExpenseContextType {
    recurringExpenses: RecurringExpense[];
    isLoading: boolean;
    error: string | null;
    refreshRecurringExpenses: (triggeredBy?: string) => Promise<void>;
    addRecurringExpense: (formData: RecurringExpenseFormData) => Promise<boolean>;
    updateRecurringExpense: (expenseId: string, formData: RecurringExpenseFormData) => Promise<boolean>;
    deleteRecurringExpense: (expenseId: string) => Promise<boolean>;
    toggleRecurringExpenseActive: (expenseId: string, newActiveState: boolean) => Promise<boolean>;
}

const RecurringExpenseContext = createContext<RecurringExpenseContextType | undefined>(undefined);

// --- Provider Implementation ---
export function RecurringExpenseProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { selectedProperty, propertyMembers = [], isLoading: propertyLoading } = useProperty() as { selectedProperty: any, propertyMembers: PropertyMemberWithProfile[], isLoading: boolean }; // Added type assertion
    const selectedPropertyId = selectedProperty?.id;
    const currentUserId = user?.id;
    const { toast } = useToast();

    const [recurringExpensesData, setRecurringExpensesData] = useState<RecurringExpenseRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Memoized map for profile lookup
    const profileMap = useMemo(() => {
        const map = new Map<string, Profile | null>(); // Store Profile or null
        (Array.isArray(propertyMembers) ? propertyMembers : []).forEach(member => {
            if (member?.user_id) {
                 map.set(member.user_id, member.profile); // Store the profile object itself (or null)
            }
        });
        return map;
    }, [propertyMembers]);


    const fetchRecurringExpenses = useCallback(async (propertyId: string | null | undefined, userId: string | null | undefined, triggeredBy = 'unknown') => {
        console.log(`%cRecurringExpenseContext: fetchRecurringExpenses triggered by: ${triggeredBy} for property: ${propertyId ?? 'None'}`, 'color: purple; font-weight: bold;');
        if (!propertyId || !userId) {
            setRecurringExpensesData([]); setIsLoading(false); setError(null);
            console.log(`RecurringExpenseContext: Skipping fetch. Property ID: ${propertyId}, User ID: ${userId}`);
            return;
        }
        setIsLoading(true); setError(null);
        try {
            // Fetch recurring expenses with creator and payer profiles directly
            const { data, error: fetchError } = await supabase
                .from('recurring_expenses')
                .select(`
                    *,
                    created_by_profile: profiles!recurring_expenses_created_by_fkey(*),
                    paid_by_profile: profiles!recurring_expenses_paid_by_user_id_fkey(*)
                `)
                .eq('property_id', propertyId)
                .order('created_at', { ascending: false });

            if (fetchError) throw new Error(`Recurring expenses fetch error: ${fetchError.message}`);
            setRecurringExpensesData(data || []);
        } catch (err: any) {
            console.error("RecurringExpenseContext: Error during fetch:", err);
            setError(err.message || 'Failed to fetch recurring expense data.');
            setRecurringExpensesData([]);
            toast({ title: "Error Loading Recurring Expenses", description: err.message || "Failed to load templates.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, supabase]); // Added supabase dependency


    useEffect(() => {
        console.log(`RecurringExpenseContext: useEffect check. PropID: ${selectedPropertyId}, UserID: ${currentUserId}, PropLoading: ${propertyLoading}`);
        if (!propertyLoading) {
            if (selectedPropertyId && currentUserId) {
                fetchRecurringExpenses(selectedPropertyId, currentUserId, 'useEffect');
            } else {
                console.log("RecurringExpenseContext: useEffect clearing state (no property/user).");
                setRecurringExpensesData([]);
                setIsLoading(false);
                setError(null);
            }
        } else {
            console.log("RecurringExpenseContext: useEffect waiting for PropertyContext loading.");
            setIsLoading(true);
        }
    }, [selectedPropertyId, currentUserId, propertyLoading, fetchRecurringExpenses]);


    const refreshRecurringExpenses = useCallback(async (triggeredBy = 'manual') => {
        console.log(`%cRecurringExpenseContext: Manual Refresh triggered by: ${triggeredBy}`, 'color: darkmagenta; font-weight: bold;');
        await fetchRecurringExpenses(selectedPropertyId, currentUserId, triggeredBy);
    }, [fetchRecurringExpenses, selectedPropertyId, currentUserId]);


    // --- CRUD Operations ---
    const addRecurringExpense = async (formData: RecurringExpenseFormData): Promise<boolean> => {
        console.log("RecurringExpenseContext: addRecurringExpense started.", { formData });
        if (!selectedPropertyId || !currentUserId || !propertyMembers) {
            toast({ title: "Missing Information", description: "Cannot add template. Property, user, or member details missing.", variant: "destructive" });
            return false;
        }
         if (!isValidDate(formData.start_date)) { toast({ title: "Invalid Date", description: "Start date is invalid.", variant: "destructive" }); return false; }
         if (formData.end_date && !isValidDate(formData.end_date)) { toast({ title: "Invalid Date", description: "End date is invalid.", variant: "destructive" }); return false; }
         if (formData.end_date && formData.start_date > formData.end_date) { toast({ title: "Invalid Date", description: "End date cannot be before start date.", variant: "destructive" }); return false; }
        if (typeof formData.amount !== 'number' || isNaN(formData.amount) || formData.amount <= 0) { toast({ title: "Invalid Amount", description: "Amount must be a positive number.", variant: "destructive"}); return false; }
        if (typeof formData.interval !== 'number' || isNaN(formData.interval) || formData.interval < 1) { toast({ title: "Invalid Interval", description: "Interval must be 1 or greater.", variant: "destructive"}); return false; }

        const payerId = formData.paid_by_user_id;
         if (!payerId) {
             toast({ title: "Missing Payer", description: "Payer must be selected.", variant: "destructive"});
             return false;
         }
        if (payerId && !propertyMembers.some(m => m.user_id === payerId)) {
            toast({ title: "Invalid Payer", description: "Selected payer is not a member of this property.", variant: "destructive"});
            return false;
        }

        setIsLoading(true); // Use context's isLoading state
        try {
            const splitDetailsJson = buildSplitDetailsJson(formData, payerId);
            // Use the specific Insert type from Database interface
            const insertData: Database['public']['Tables']['recurring_expenses']['Insert'] = {
                property_id: selectedPropertyId,
                description: formData.description,
                amount: formData.amount,
                category: formData.category, // Ensure category matches RecurringExpenseCategory enum
                created_by: currentUserId,
                frequency: formData.frequency,
                interval: formData.interval,
                start_date: format(startOfDay(formData.start_date), 'yyyy-MM-dd'),
                // next_due_date will be set by DB trigger likely based on start_date
                end_date: formData.end_date ? format(startOfDay(formData.end_date), 'yyyy-MM-dd') : null,
                paid_by_user_id: payerId,
                split_method: formData.split_method,
                split_details: splitDetailsJson,
                notes: formData.notes || null,
                is_active: formData.is_active ?? true,
            };
            console.log("Inserting recurring expense:", insertData);
            const { error: insertError } = await supabase.from('recurring_expenses').insert(insertData);
            if (insertError) throw insertError;
            toast({ title: "Success", description: `Recurring expense template "${formData.description}" created.` });
            await refreshRecurringExpenses('addRecurringExpense');
            return true;
        } catch (err: any) {
            console.error("RecurringExpenseContext: Error adding recurring expense:", err);
            toast({ title: "Error Creating Template", description: err.message || "An unexpected error occurred.", variant: "destructive" });
            return false;
        } finally {
            setIsLoading(false);
        }
    };


    const updateRecurringExpense = async (expenseId: string, formData: RecurringExpenseFormData): Promise<boolean> => {
        console.log(`RecurringExpenseContext: updateRecurringExpense started for ID: ${expenseId}`, { formData });
        if (!expenseId || !selectedPropertyId || !currentUserId || !propertyMembers) {
            toast({ title: "Missing Information", description: "Cannot update template. Required details missing.", variant: "destructive" });
            return false;
        }
         if (!isValidDate(formData.start_date)) { toast({ title: "Invalid Date", description: "Start date is invalid.", variant: "destructive" }); return false; }
         if (formData.end_date && !isValidDate(formData.end_date)) { toast({ title: "Invalid Date", description: "End date is invalid.", variant: "destructive" }); return false; }
         if (formData.end_date && formData.start_date > formData.end_date) { toast({ title: "Invalid Date", description: "End date cannot be before start date.", variant: "destructive" }); return false; }
        if (typeof formData.amount !== 'number' || isNaN(formData.amount) || formData.amount <= 0) { toast({ title: "Invalid Amount", description: "Amount must be a positive number.", variant: "destructive"}); return false; }
        if (typeof formData.interval !== 'number' || isNaN(formData.interval) || formData.interval < 1) { toast({ title: "Invalid Interval", description: "Interval must be 1 or greater.", variant: "destructive"}); return false; }

        const payerId = formData.paid_by_user_id;
         if (!payerId) {
             toast({ title: "Missing Payer", description: "Payer must be selected.", variant: "destructive"});
             return false;
         }
        if (payerId && !propertyMembers.some(m => m.user_id === payerId)) {
            toast({ title: "Invalid Payer", description: "Selected payer is not a member of this property.", variant: "destructive"});
            return false;
        }

        setIsLoading(true);
        try {
            const splitDetailsJson = buildSplitDetailsJson(formData, payerId);
            const existingRecord = recurringExpensesData.find(rec => rec.id === expenseId);
            if (!existingRecord) { throw new Error("Cannot update: Existing recurring expense template not found."); }

            // Use the specific Update type
            const updateData: Database['public']['Tables']['recurring_expenses']['Update'] = {
                description: formData.description,
                amount: formData.amount,
                category: formData.category,
                frequency: formData.frequency,
                interval: formData.interval,
                start_date: format(startOfDay(formData.start_date), 'yyyy-MM-dd'),
                end_date: formData.end_date ? format(startOfDay(formData.end_date), 'yyyy-MM-dd') : null,
                paid_by_user_id: payerId,
                split_method: formData.split_method,
                split_details: splitDetailsJson,
                notes: formData.notes || null,
                is_active: formData.is_active ?? true,
                updated_at: new Date().toISOString(),
                // next_due_date should likely be recalculated by a trigger/function if start_date/frequency/interval changes
            };
             console.log(`Updating recurring expense ID ${expenseId}:`, updateData);
            const { error: updateError } = await supabase.from('recurring_expenses').update(updateData).eq('id', expenseId);
            if (updateError) throw updateError;
            toast({ title: "Success", description: `Recurring expense template "${formData.description}" updated.` });
            await refreshRecurringExpenses('updateRecurringExpense');
            return true;
        } catch (err: any) {
            console.error(`RecurringExpenseContext: Error updating recurring expense ID ${expenseId}:`, err);
            toast({ title: "Error Updating Template", description: err.message || "An unexpected error occurred.", variant: "destructive" });
            return false;
        } finally {
            setIsLoading(false);
        }
    };


    const deleteRecurringExpense = async (expenseId: string): Promise<boolean> => {
        console.log(`RecurringExpenseContext: deleteRecurringExpense started for ID: ${expenseId}`);
        if (!expenseId) {
            toast({ title: "Missing Information", description: "Cannot delete template. ID is missing.", variant: "destructive" });
            return false;
        }
        setIsLoading(true);
        try {
            const { error: deleteError } = await supabase.from('recurring_expenses').delete().eq('id', expenseId);
            if (deleteError) throw deleteError;
            toast({ title: "Success", description: "Recurring expense template deleted." });
            await refreshRecurringExpenses('deleteRecurringExpense');
            return true;
        } catch (err: any) {
            console.error(`RecurringExpenseContext: Error deleting recurring expense ID ${expenseId}:`, err);
            toast({ title: "Error Deleting Template", description: err.message || "An unexpected error occurred.", variant: "destructive" });
            return false;
        } finally {
            setIsLoading(false);
        }
    };


    const toggleRecurringExpenseActive = async (expenseId: string, newActiveState: boolean): Promise<boolean> => {
        console.log(`RecurringExpenseContext: toggleRecurringExpenseActive started for ID: ${expenseId} to state: ${newActiveState}`);
        if (!expenseId) {
             toast({ title: "Missing Information", description: "Cannot toggle status. Template ID is missing.", variant: "destructive" });
             return false;
        }
        const currentExpense = recurringExpensesData.find(exp => exp.id === expenseId);
        const description = currentExpense?.description || 'the template';
        setIsLoading(true); // Indicate loading for this specific action
        try {
            // Use the specific Update type
            const updatePayload: Database['public']['Tables']['recurring_expenses']['Update'] = {
                is_active: newActiveState,
                updated_at: new Date().toISOString(),
                // Consider if next_due_date needs recalculation here via RPC or if trigger handles it
            };
            console.log(`Updating is_active for ID ${expenseId}:`, updatePayload);
            const { error: updateError } = await supabase.from('recurring_expenses').update(updatePayload).eq('id', expenseId);
            if (updateError) throw updateError;
            // Update local state immediately for better UX
            setRecurringExpensesData(prevData =>
                prevData.map(item =>
                    item.id === expenseId
                        ? { ...item, is_active: newActiveState, updated_at: updatePayload.updated_at! }
                        : item
                )
            );
            toast({ title: "Success", description: `Template "${description}" ${newActiveState ? 'resumed' : 'paused'}.` });
            // No full refresh needed usually, unless next_due_date needs to be re-fetched visually
            // await refreshRecurringExpenses('toggleActive');
            return true;
        } catch (err: any) {
             console.error(`RecurringExpenseContext: Error toggling active status for ID ${expenseId}:`, err);
             toast({ title: "Error Updating Status", description: err.message || "An unexpected error occurred.", variant: "destructive" });
             return false;
        } finally {
             setIsLoading(false);
        }
    };


    // --- Data Enrichment ---
    const enrichedRecurringExpenses = useMemo<RecurringExpense[]>(() => {
        console.log(`RecurringExpenseContext: Recalculating enrichedRecurringExpenses. Have ${recurringExpensesData.length} raw items.`);
        // Use data fetched with profiles already joined
        return (Array.isArray(recurringExpensesData) ? recurringExpensesData : []).map((row): RecurringExpense => {
             // Cast the nested profile objects fetched via select
             const creatorProfile = row.created_by_profile as Profile | null;
             const payerProfile = row.paid_by_profile as Profile | null;

             return {
                ...row,
                // Cast enums for type safety
                category: row.category as RecurringExpenseCategory,
                split_method: row.split_method as SplitMethod,
                frequency: row.frequency as Frequency,
                split_details: row.split_details, // Already Json
                // Assign casted profiles
                created_by_profile: creatorProfile,
                paid_by_profile: payerProfile,
            };
        });
    }, [recurringExpensesData]); // Only depends on the raw fetched data


    // Provide Context Value
    const value: RecurringExpenseContextType = {
        recurringExpenses: enrichedRecurringExpenses,
        isLoading: isLoading || propertyLoading,
        error,
        refreshRecurringExpenses,
        addRecurringExpense,
        updateRecurringExpense,
        deleteRecurringExpense,
        toggleRecurringExpenseActive,
    };

    return (
        <RecurringExpenseContext.Provider value={value}>
            {children}
        </RecurringExpenseContext.Provider>
    );
}

// Custom Hook to Consume Context
export const useRecurringExpense = () => {
    const context = useContext(RecurringExpenseContext);
    if (context === undefined) {
        throw new Error('useRecurringExpense must be used within a RecurringExpenseProvider');
    }
    return context;
};