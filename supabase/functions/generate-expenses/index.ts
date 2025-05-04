// supabase/functions/generate-expenses/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addDays, addWeeks, addMonths, addQuarters, addYears, format } from 'https://esm.sh/date-fns@2.29.3';

// Define types matching your database schema (simplified for function context)
// Ideally, share types between frontend and functions, but keep simple here for clarity
interface RecurringExpense {
  id: string;
  property_id: string;
  description: string;
  amount: number;
  category: string;
  paid_by_user_id: string;
  split_method: string; // 'equal', 'percentage', 'custom', 'payer_only'
  split_details: any | null; // JSONB - will need parsing
  frequency: string; // 'daily', 'weekly', 'monthly', 'quarterly', 'annually'
  interval: number;
  start_date: string; // date string 'YYYY-MM-DD'
  next_due_date: string; // date string 'YYYY-MM-DD'
  end_date: string | null; // date string 'YYYY-MM-DD'
  notes: string | null;
}

interface RpcSplitInput {
  user_id: string;
  amount: number;
  status: 'owed' | 'paid';
}

// --- Helper: Calculate Next Due Date ---
function calculateNextDueDate(currentDueDate: Date, frequency: string, interval: number): Date {
  switch (frequency) {
    case 'daily': return addDays(currentDueDate, interval);
    case 'weekly': return addWeeks(currentDueDate, interval);
    case 'monthly': return addMonths(currentDueDate, interval);
    case 'quarterly': return addQuarters(currentDueDate, interval);
    case 'annually': return addYears(currentDueDate, interval);
    default: throw new Error(`Unsupported frequency: ${frequency}`);
  }
}

// --- Helper: Calculate Splits for RPC ---
// NOTE: This requires knowing the members of the property at the time of generation.
// Fetching members here adds complexity. A simpler initial approach assumes split_details
// stores the necessary info (e.g., user_ids for equal split are derived later if needed).
// This version focuses on Percentage/Custom using stored details. Equal/PayerOnly are simpler.
// We will need a privileged Supabase client to fetch members if calculating 'equal' here.
async function calculateSplitsForRpc(
    supabaseAdmin: SupabaseClient, // Use admin client to potentially fetch members
    recurringExpense: RecurringExpense,
    propertyMembers: { user_id: string }[] // Pass members for 'equal' split
): Promise<RpcSplitInput[]> {

    const { amount, paid_by_user_id, split_method, split_details, property_id } = recurringExpense;
    const totalAmount = amount;
    const payerId = paid_by_user_id;
    let calculatedSplits: RpcSplitInput[] = [];

    try {
        switch (split_method) {
            case 'equal':
                // Requires fetching current members of the property
                // const { data: members, error: memberError } = await supabaseAdmin
                //     .from('property_members')
                //     .select('user_id')
                //     .eq('property_id', property_id);

                // if (memberError) throw new Error(`Failed to fetch property members: ${memberError.message}`);
                // const memberIds = members?.map(m => m.user_id) ?? [];

                // Use passed members for simplicity now
                const memberIds = propertyMembers.map(m => m.user_id);

                if (memberIds.length === 0) {
                    // If no members, assign full amount to payer? Or error? Assume assign to payer for now.
                    console.warn(`No members found for property ${property_id} during equal split calculation. Assigning full amount to payer.`);
                    calculatedSplits.push({ user_id: payerId, amount: totalAmount, status: 'paid' });
                } else {
                    const amountPerPerson = totalAmount / memberIds.length;
                    let remainingAmount = totalAmount;
                    memberIds.forEach((memberId, index) => {
                         // Assign remainder to the last person to avoid rounding errors
                        const splitAmount = (index === memberIds.length - 1)
                            ? parseFloat(remainingAmount.toFixed(2))
                            : parseFloat(amountPerPerson.toFixed(2));
                        remainingAmount -= splitAmount;
                        calculatedSplits.push({
                            user_id: memberId,
                            amount: splitAmount,
                            status: memberId === payerId ? 'paid' : 'owed',
                        });
                    });
                }
                break;

            case 'percentage':
                if (!split_details || typeof split_details !== 'object' || !Array.isArray(split_details.splits)) {
                    throw new Error(`Invalid split_details for percentage split: ${JSON.stringify(split_details)}`);
                }
                let totalPercentage = 0;
                let tempSplitsPerc: { userId: string, amount: number }[] = [];
                split_details.splits.forEach((split: { user_id: string, percentage: number }) => {
                    if (!split.user_id || typeof split.percentage !== 'number' || split.percentage < 0) {
                         throw new Error(`Invalid percentage split item: ${JSON.stringify(split)}`);
                    }
                    const percentage = split.percentage;
                    totalPercentage += percentage;
                    tempSplitsPerc.push({ userId: split.user_id, amount: totalAmount * (percentage / 100) });
                });

                if (Math.abs(totalPercentage - 100) > 0.01) {
                     throw new Error(`Stored percentages for recurring expense ${recurringExpense.id} must sum to 100%. Total: ${totalPercentage.toFixed(2)}%`);
                }
                 // Adjust for rounding errors (assign difference to largest share)
                let calculatedTotalPerc = tempSplitsPerc.reduce((sum, split) => sum + parseFloat(split.amount.toFixed(2)), 0);
                let differencePerc = parseFloat((totalAmount - calculatedTotalPerc).toFixed(2));
                if (differencePerc !== 0 && tempSplitsPerc.length > 0) {
                    tempSplitsPerc.sort((a, b) => b.amount - a.amount)[0].amount += differencePerc;
                }

                calculatedSplits = tempSplitsPerc.map(split => ({
                    user_id: split.userId,
                    amount: parseFloat(split.amount.toFixed(2)),
                    status: split.userId === payerId ? 'paid' : 'owed',
                }));
                break;

            case 'custom':
                if (!split_details || typeof split_details !== 'object' || !Array.isArray(split_details.splits)) {
                    throw new Error(`Invalid split_details for custom split: ${JSON.stringify(split_details)}`);
                }
                let customTotal = 0;
                split_details.splits.forEach((split: { user_id: string, amount: number }) => {
                     if (!split.user_id || typeof split.amount !== 'number' || split.amount < 0) {
                         throw new Error(`Invalid custom split item: ${JSON.stringify(split)}`);
                    }
                    const numericAmount = parseFloat(split.amount.toFixed(2));
                    customTotal += numericAmount;
                    calculatedSplits.push({
                        user_id: split.user_id,
                        amount: numericAmount,
                        status: split.user_id === payerId ? 'paid' : 'owed',
                    });
                });
                if (Math.abs(customTotal - totalAmount) > 0.01) {
                     throw new Error(`Stored custom amounts for recurring expense ${recurringExpense.id} must sum to ${totalAmount}. Total: ${customTotal.toFixed(2)}`);
                }
                break;

            case 'payer_only':
                calculatedSplits.push({ user_id: payerId, amount: totalAmount, status: 'paid' });
                break;

            default:
                throw new Error(`Unsupported split_method in recurring expense ${recurringExpense.id}: ${split_method}`);
        }

        // Final validation
        if (calculatedSplits.length === 0) throw new Error("Failed to calculate any splits.");
        const finalSplitSum = calculatedSplits.reduce((sum, split) => sum + (split.amount ?? 0), 0);
        if (Math.abs(finalSplitSum - totalAmount) > 0.01) throw new Error(`Internal calculation error: Split sum (${finalSplitSum}) doesn't match total (${totalAmount}).`);

        return calculatedSplits;

    } catch (error) {
         console.error(`Error calculating splits for recurring expense ${recurringExpense.id}:`, error);
         throw error; // Re-throw to be caught by the main handler
    }
}


// --- Main Function Handler ---
serve(async (req) => {
  console.log('Starting generate-expenses function run...');
  const startTime = Date.now();

  try {
    // --- Create Supabase Admin Client ---
    // Use environment variables for security
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    }

    // IMPORTANT: Use the Service Role Key for backend operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
       auth: { persistSession: false } // Disable session persistence for server-side
    });

    // --- Fetch Due Recurring Expenses ---
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`Fetching recurring expenses due on or before: ${today}`);

    const { data: dueExpenses, error: fetchError } = await supabaseAdmin
      .from('recurring_expenses')
      .select('*')
      .eq('is_active', true)
      .lte('next_due_date', today); // Get expenses due today or earlier

    if (fetchError) {
      throw new Error(`Error fetching recurring expenses: ${fetchError.message}`);
    }

    if (!dueExpenses || dueExpenses.length === 0) {
      console.log("No recurring expenses due today.");
      return new Response("No expenses due", { status: 200 });
    }

    console.log(`Found ${dueExpenses.length} recurring expense(s) to process.`);
    let processedCount = 0;
    let errorCount = 0;

    // --- Process Each Due Expense ---
    for (const recurring of dueExpenses as RecurringExpense[]) {
      console.log(`Processing recurring expense ID: ${recurring.id}, Description: ${recurring.description}`);

      try {
        // --- Check End Date ---
        if (recurring.end_date && recurring.next_due_date > recurring.end_date) {
           console.log(`Recurring expense ${recurring.id} past its end date. Deactivating.`);
           // Deactivate it - don't generate new expense
           const { error: deactivateError } = await supabaseAdmin
             .from('recurring_expenses')
             .update({ is_active: false, updated_at: new Date().toISOString() })
             .eq('id', recurring.id);
           if (deactivateError) {
              console.error(`Failed to deactivate recurring expense ${recurring.id}: ${deactivateError.message}`);
              // Continue to next expense even if deactivation fails
           }
           continue; // Skip to the next recurring expense
        }


        // --- Fetch Property Members (Needed for 'equal' split) ---
        // This adds overhead but is necessary for correct 'equal' split calculation
         const { data: members, error: memberError } = await supabaseAdmin
             .from('property_members')
             .select('user_id')
             .eq('property_id', recurring.property_id);

         if (memberError) {
             throw new Error(`Failed to fetch property members for ${recurring.property_id}: ${memberError.message}`);
         }
         const propertyMembers = members ?? [];


        // --- Calculate Splits ---
        const splitsForRpc = await calculateSplitsForRpc(supabaseAdmin, recurring, propertyMembers);

        // --- Prepare RPC Arguments ---
        const rpcArgs = {
          p_property_id: recurring.property_id,
          p_description: recurring.description,
          p_amount: recurring.amount,
          p_date: recurring.next_due_date, // Use the due date as the expense date
          p_category: recurring.category,
          p_paid_by_user_id: recurring.paid_by_user_id,
          p_split_method: recurring.split_method,
          p_notes: recurring.notes,
          p_splits: splitsForRpc,
          p_receipt_url: null // Recurring expenses generally don't have receipts attached automatically
        };

        // --- Call Add Expense RPC ---
        console.log(`Calling add_expense_and_splits for recurring expense ${recurring.id}`);
        const { data: newExpenseId, error: rpcError } = await supabaseAdmin.rpc('add_expense_and_splits', rpcArgs);

        if (rpcError) {
          throw new Error(`RPC add_expense_and_splits failed for recurring ${recurring.id}: ${rpcError.message}`);
        }
        if (!newExpenseId) {
           throw new Error(`RPC add_expense_and_splits returned no ID for recurring ${recurring.id}`);
        }

        console.log(`Successfully generated new expense ${newExpenseId} for recurring ${recurring.id}.`);

        // --- Calculate and Update Next Due Date ---
        const currentDueDate = new Date(recurring.next_due_date + 'T00:00:00Z'); // Treat date as UTC midnight
        const nextDueDate = calculateNextDueDate(currentDueDate, recurring.frequency, recurring.interval);
        const nextDueDateString = format(nextDueDate, 'yyyy-MM-dd');

        // Also check if the *new* next due date is past the end date
        let shouldDeactivate = false;
        if (recurring.end_date && nextDueDateString > recurring.end_date) {
            console.log(`Next calculated due date (${nextDueDateString}) is past end date (${recurring.end_date}). Deactivating recurring expense ${recurring.id}.`);
            shouldDeactivate = true;
        }

        console.log(`Updating recurring expense ${recurring.id}. Next due date: ${nextDueDateString}. Deactivating: ${shouldDeactivate}`);
        const { error: updateError } = await supabaseAdmin
          .from('recurring_expenses')
          .update({
            next_due_date: nextDueDateString,
            is_active: !shouldDeactivate, // Deactivate if needed
            updated_at: new Date().toISOString()
          })
          .eq('id', recurring.id);

        if (updateError) {
          // Log error but don't necessarily fail the whole function run
          console.error(`Failed to update next_due_date for recurring expense ${recurring.id}: ${updateError.message}`);
           errorCount++; // Increment error count, but continue processing others
        } else {
           processedCount++;
        }

      } catch (processError) {
        // Catch errors processing a single recurring expense
        console.error(`Error processing recurring expense ID ${recurring.id}:`, processError);
        errorCount++;
        // Continue to the next expense
      }
    } // End loop through dueExpenses

    const duration = Date.now() - startTime;
    console.log(`generate-expenses function finished in ${duration}ms. Processed: ${processedCount}, Errors: ${errorCount}`);

    return new Response(JSON.stringify({ message: `Processed ${processedCount} expenses, ${errorCount} errors.` }), {
      headers: { "Content-Type": "application/json" },
      status: errorCount > 0 ? 500 : 200, // Indicate partial success if errors occurred
    });

  } catch (e) {
    // Catch major errors (e.g., client creation, initial fetch)
    console.error("Critical error in generate-expenses function:", e);
    const duration = Date.now() - startTime;
    console.log(`generate-expenses function failed critically after ${duration}ms.`);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
})