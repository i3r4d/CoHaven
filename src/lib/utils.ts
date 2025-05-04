// src/lib/utils.ts
// v3 - Corrected formatSplitMethod & formatCategoryName parameter types to Type Aliases (SplitMethodType, ExpenseCategoryType) to align with types.ts data structures

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, isValid as isValidDate, compareAsc, startOfDay } from 'date-fns';
// --- Import Type Aliases/Enums needed by functions ---
import {
    // Frequency Enums/Aliases
    Frequency, // Enum (potentially used elsewhere)
    FrequencyType, // Alias used by formatFrequencyDetailed

    // SplitMethod Enums/Aliases
    SplitMethod, // Enum (potentially used elsewhere, e.g., dropdowns)
    SplitMethodType, // Alias used by formatSplitMethod (CORRECTED)

    // ExpenseCategory Enums/Aliases
    ExpenseCategory, // Enum (potentially used elsewhere)
    ExpenseCategoryType, // Alias used by formatCategoryName (CORRECTED)

    // Other Types
    RecurringExpense, // Type used by getTemplateStatus

} from '@/integrations/supabase/types';

/**
 * Combines Tailwind classes using clsx and tailwind-merge.
 * Ensures proper merging of conflicting classes.
 * @param inputs Class values (strings, arrays, objects)
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates initials from a full name.
 * Handles single names, multiple names, and empty/null inputs.
 * @param name The full name string (can include first and last name).
 * @returns A string containing the initials (usually 1 or 2 characters), or '?' if name is invalid.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const nameParts = name.trim().split(/\s+/);
  if (nameParts.length === 1 && nameParts[0].length > 0) { return nameParts[0][0].toUpperCase(); }
  else if (nameParts.length > 1) { const firstInitial = nameParts[0][0]; const lastInitial = nameParts[nameParts.length - 1][0]; return `${firstInitial}${lastInitial}`.toUpperCase(); }
  return '?';
}

/**
 * Formats frequency and interval into a human-readable string.
 * Example: frequency='monthly', interval=1 -> "Monthly"
 * Example: frequency='weekly', interval=2 -> "Every 2 Weeks"
 * Note: Uses FrequencyType alias for input.
 * @param freq The frequency type alias ('monthly', 'quarterly', etc.)
 * @param interval The interval number (>= 1)
 * @returns A formatted frequency string or 'N/A' if inputs are invalid.
 */
export function formatFrequencyDetailed(freq: FrequencyType | undefined | null, interval: number | undefined | null): string {
    if (!freq || typeof interval !== 'number' || interval < 1) return 'N/A';
    const base = freq.charAt(0).toUpperCase() + freq.slice(1);
    if (interval === 1) { return base; }
    let pluralBase = base;
    // Adjust pluralization based on FrequencyType values
    if (freq === 'monthly') { pluralBase = 'Months'; }
    else if (freq === 'quarterly') { pluralBase = 'Quarters'; }
    else if (freq === 'annually') { pluralBase = 'Years'; }
    else if (freq === 'biannually') { pluralBase = 'Bi-annual Periods'; }
    else { pluralBase = base + 's'; } // Default pluralization (covers 'weekly', 'daily' if added)
    return `Every ${interval} ${pluralBase}`;
};


/**
 * Formats an ISO date string or Date object into 'MMM dd, yyyy'.
 * Returns 'N/A' if the date is invalid or null.
 * @param dateInput ISO string ('YYYY-MM-DD') or Date object or null/undefined
 * @returns Formatted date string or 'N/A'.
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
    if (!dateInput) return 'N/A';
    try {
        const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
        if (isValidDate(date)) { return format(date, 'MMM dd, yyyy'); }
        console.warn("formatDate encountered invalid date:", dateInput);
        return 'Invalid Date';
    } catch (e) {
        console.error("Error formatting date:", dateInput, e);
        return 'Error';
    }
}

/**
 * Formats a number as USD currency.
 * @param amount The number to format.
 * @returns Formatted currency string or '$0.00'/'N/A'.
 */
export const formatCurrency = (amount: number | null | undefined): string => {
    if (amount == null || typeof amount !== 'number' || isNaN(amount)) { return '$0.00'; }
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }
    catch (e) { console.error("Error formatting currency:", amount, e); return 'N/A'; }
};

/**
 * Formats a split method string for display.
 * @param method The split method **type alias** value (e.g., 'equal', 'fixed'). Accepts SplitMethodType.
 * @returns Human-readable split method string or 'N/A'.
 */
// --- CORRECTED PARAMETER TYPE to SplitMethodType ---
export const formatSplitMethod = (method: SplitMethodType | undefined | null): string => {
    if (!method) return 'N/A';
    // The replace logic works on the string values from the type alias
    return method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Formats an expense category string for display.
 * @param categoryValue The category **type alias** value (e.g., 'utilities', 'hoa_fees'). Accepts ExpenseCategoryType.
 * @returns Human-readable category string or 'N/A'.
 */
 // --- CORRECTED PARAMETER TYPE to ExpenseCategoryType ---
export const formatCategoryName = (categoryValue: ExpenseCategoryType | string | null | undefined): string => {
    // Check if it's already formatted (contains space) or needs formatting
    if (!categoryValue) return 'N/A';
    const categoryString = String(categoryValue);
    // Removed check for space, assume input is always the alias/enum value format
    return categoryString.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};


export type ConcreteTemplateStatus = 'active' | 'paused' | 'ended';

/**
 * Determines the status (active, paused, ended) of a recurring expense template.
 * @param expense The RecurringExpense object.
 * @returns The status as ConcreteTemplateStatus ('active', 'paused', 'ended').
 */
export const getTemplateStatus = (expense: RecurringExpense): ConcreteTemplateStatus => {
    const today = startOfDay(new Date());
    if (expense.end_date) {
        try {
            const endDate = startOfDay(parseISO(expense.end_date));
            if (isValidDate(endDate) && compareAsc(endDate, today) <= 0) { return 'ended'; }
        } catch (e) {
            console.error(`Invalid end_date format encountered in getTemplateStatus for recurring expense ${expense.id}: ${expense.end_date}`, e);
        }
    }
    return expense.is_active ? 'active' : 'paused';
};