// src/components/recurring-expenses/AddRecurringExpenseDialog.tsx
// Corrected: Removed 'Constants' import and replaced its usage with imported enums.
import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose // Keep DialogClose for footer button
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, AlertCircle, Loader2 } from 'lucide-react'; // Added Loader2
import { format, startOfDay, parseISO, isValid as isValidDate } from 'date-fns';
import { cn } from "@/lib/utils";
import { useRecurringExpense } from '@/contexts/RecurringExpenseContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAuth } from '@/contexts/AuthContext';
// Corrected Import Line: Removed Constants
import {
    RecurringExpenseFormData,
    RecurringExpense,
    ExpenseCategory, // Use this
    SplitMethod,     // Use this
    Frequency,       // Use this
    Profile,
    PropertyMemberWithProfile,
    Json,
    RecurringExpenseCategory // Make sure this is imported if different from ExpenseCategory
} from '@/integrations/supabase/types';
import { ScrollArea } from '@/components/ui/scroll-area';

// --- Zod Validation Schema ---
const recurringExpenseSchema = z.object({
    description: z.string().min(1, "Description is required"),
    amount: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number({ invalid_type_error: "Amount must be a number" }).positive("Amount must be positive")
    ),
    // Corrected: Use imported RecurringExpenseCategory enum
    category: z.nativeEnum(RecurringExpenseCategory, { errorMap: () => ({ message: "Please select a category" }) }),
    // Corrected: Use imported Frequency enum
    frequency: z.nativeEnum(Frequency, { errorMap: () => ({ message: "Please select a frequency" }) }),
    interval: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number({ invalid_type_error: "Interval must be a number" }).int().min(1, "Interval must be at least 1")
    ),
    start_date: z.date({ required_error: "Start date is required" }),
    end_date: z.date().optional().nullable(),
    paid_by_user_id: z.string().uuid("Payer is required"),
    // Corrected: Use imported SplitMethod enum
    split_method: z.nativeEnum(SplitMethod, { errorMap: () => ({ message: "Please select a split method" }) }),
    notes: z.string().optional().nullable(),
    percentage_splits: z.record(z.string().uuid(), z.number().min(0).max(100).nullable()).optional(),
    custom_splits: z.record(z.string().uuid(), z.number().min(0).nullable()).optional(),
    is_active: z.boolean().default(true),
})
.refine(data => !data.end_date || data.end_date >= data.start_date, {
    message: "End date cannot be before start date",
    path: ["end_date"],
})
.refine(data => {
    // Corrected: Use imported SplitMethod enum
    if (data.split_method === SplitMethod.Percentage) {
        const total = Object.values(data.percentage_splits ?? {}).reduce((sum, val) => sum + (val ?? 0), 0);
        return Math.abs(total - 100) < 0.01;
    }
    return true;
}, { message: "Percentages must add up to 100%", path: ["percentage_splits"] })
.refine(data => {
    // Corrected: Use imported SplitMethod enum
    if (data.split_method === SplitMethod.Custom) { // Assuming 'Custom' is the enum value
        const total = Object.values(data.custom_splits ?? {}).reduce((sum, val) => sum + (val ?? 0), 0);
        return Math.abs(total - data.amount) < 0.01;
    }
    return true;
}, { message: "Custom amounts must add up to the total expense amount", path: ["custom_splits"] });


// --- Component Props ---
interface AddRecurringExpenseDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    initialData?: RecurringExpense | null;
    isDuplicate?: boolean;
}

// --- Helper to parse split_details for form ---
const parseSplitDetailsForForm = (split_details: Json | null | undefined, method: SplitMethod | undefined): { percentage_splits?: Record<string, number | null>, custom_splits?: Record<string, number | null> } => {
    if (!split_details || typeof split_details !== 'object' || !('splits' in split_details) || typeof split_details.splits !== 'object') {
        return {};
    }
    const splits = split_details.splits as Record<string, unknown>; // Intermediate cast

    // Corrected: Use imported SplitMethod enum
    if (method === SplitMethod.Percentage) {
        // Ensure values are numbers or null
        const percentageSplits: Record<string, number | null> = {};
        Object.entries(splits).forEach(([key, value]) => {
            percentageSplits[key] = typeof value === 'number' ? value : null;
        });
        return { percentage_splits: percentageSplits };
    }
    // Corrected: Use imported SplitMethod enum
    if (method === SplitMethod.Custom) {
        const customSplits: Record<string, number | null> = {};
         Object.entries(splits).forEach(([key, value]) => {
             customSplits[key] = typeof value === 'number' ? value : null;
         });
        return { custom_splits: customSplits };
    }
    return {};
};


// --- Component ---
export function AddRecurringExpenseDialog({
    isOpen,
    onOpenChange,
    initialData = null,
    isDuplicate = false
}: AddRecurringExpenseDialogProps) {
    const { addRecurringExpense, isLoading: isContextLoading } = useRecurringExpense();
    const { memberProfiles = [] } = useProperty();
    const { user } = useAuth();

    // Default form values
    const defaultFormValues: RecurringExpenseFormData = {
        description: "", amount: 0, category: undefined, // Category is required, but might not have a default value preference
        frequency: Frequency.Monthly, // Corrected: Use enum
        interval: 1,
        start_date: startOfDay(new Date()), end_date: null,
        paid_by_user_id: user?.id ?? "", // Required, set from user or leave empty string if no user? Schema requires UUID.
        split_method: SplitMethod.Equal, // Corrected: Use enum
        notes: "", percentage_splits: {}, custom_splits: {}, is_active: true,
    };

    const form = useForm<RecurringExpenseFormData>({
        resolver: zodResolver(recurringExpenseSchema),
        defaultValues: defaultFormValues,
    });

    const { handleSubmit, control, watch, reset, formState: { errors, isSubmitting: isFormSubmitting }, setValue, getValues, setError } = form;

    const watchedSplitMethod = watch("split_method");
    const watchedAmount = watch("amount");
    const isLoading = isFormSubmitting || isContextLoading; // Combined loading state

    // Effect to reset or populate the form when dialog opens/initialData changes
    useEffect(() => {
        if (isOpen) {
            let valuesToSet: RecurringExpenseFormData;
            if (initialData) {
                const startDate = initialData.start_date && isValidDate(parseISO(initialData.start_date)) ? parseISO(initialData.start_date) : startOfDay(new Date());
                const endDate = initialData.end_date && isValidDate(parseISO(initialData.end_date)) ? parseISO(initialData.end_date) : null;
                const splitFormValues = parseSplitDetailsForForm(initialData.split_details, initialData.split_method);

                valuesToSet = {
                    description: initialData.description,
                    amount: initialData.amount,
                    category: initialData.category,
                    frequency: initialData.frequency,
                    interval: initialData.interval,
                    start_date: isDuplicate ? startOfDay(new Date()) : startDate,
                    end_date: isDuplicate ? null : endDate, // Keep end date when duplicating
                    paid_by_user_id: initialData.paid_by_user_id ?? (user?.id ?? ""), // Fallback to current user if initial missing
                    split_method: initialData.split_method,
                    notes: initialData.notes ?? "",
                    percentage_splits: splitFormValues.percentage_splits ?? {},
                    custom_splits: splitFormValues.custom_splits ?? {},
                    is_active: isDuplicate ? true : initialData.is_active,
                };
            } else {
                 valuesToSet = {
                    ...defaultFormValues,
                    paid_by_user_id: user?.id ?? "", // Ensure default payer is set
                    start_date: startOfDay(new Date()),
                 };
            }
            // Ensure payer ID is always a non-empty string if user exists, to satisfy schema/Select requirement
            if (!valuesToSet.paid_by_user_id && user?.id) {
                valuesToSet.paid_by_user_id = user.id;
            }
            reset(valuesToSet);
        }
    }, [isOpen, initialData, isDuplicate, reset, user, defaultFormValues]); // Removed setValue/getValues


    const onSubmit = async (data: RecurringExpenseFormData) => {
        console.log("Submitting Recurring Expense Data:", data);
        // Add validation check for payer just in case, though schema should handle it
        if (!data.paid_by_user_id) {
             setError("paid_by_user_id", { type: "manual", message: "Payer selection is required." });
             return;
        }
        const success = await addRecurringExpense(data);
        if (success) {
            onOpenChange(false);
        }
    };

    const dialogTitle = isDuplicate ? "Duplicate Recurring Expense Template" : "Add Recurring Expense Template";
    const dialogDescription = isDuplicate ? "Create a new template based on an existing one." : "Create a template for expenses that occur regularly.";
    const saveButtonText = isLoading ? 'Saving...' : (isDuplicate ? 'Save Duplicate Template' : 'Save Template');

    // Helper to format enum keys/values for display
    const formatEnumForDisplay = (enumValue: string): string => {
        return enumValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };


    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[calc(90vh-200px)] overflow-y-auto pr-6">
                    <form id="add-recurring-expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4 pl-1">
                        {/* Basic Details */}
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2 col-span-2"> <Label htmlFor="description">Description</Label> <Input id="description" {...form.register("description")} placeholder="e.g., Monthly Rent, Annual HOA Dues" /> {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>} </div>
                             <div className="space-y-2"> <Label htmlFor="amount">Amount ($)</Label> <Input id="amount" type="number" step="0.01" {...form.register("amount")} placeholder="0.00" /> {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>} </div>
                             <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Controller name="category" control={control} render={({ field }) => (
                                    // Corrected: Use RecurringExpenseCategory enum
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger id="category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                                        <SelectContent>
                                            {Object.values(RecurringExpenseCategory).map((value) => (
                                                <SelectItem key={value} value={value}>
                                                    {formatEnumForDisplay(value)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}/>
                                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
                            </div>
                        </div>
                        {/* Schedule Details */}
                        <div className="grid grid-cols-4 gap-4">
                             <div className="space-y-2 col-span-2">
                                <Label htmlFor="frequency">Frequency</Label>
                                <Controller name="frequency" control={control} render={({ field }) => (
                                    // Corrected: Use Frequency enum
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger id="frequency"><SelectValue placeholder="Select frequency..." /></SelectTrigger>
                                        <SelectContent>
                                            {Object.values(Frequency).map((value) => (
                                                <SelectItem key={value} value={value}>
                                                    {formatEnumForDisplay(value)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}/>
                                {errors.frequency && <p className="text-sm text-destructive">{errors.frequency.message}</p>}
                            </div>
                             <div className="space-y-2 col-span-2"> <Label htmlFor="interval">Interval</Label> <Input id="interval" type="number" min="1" step="1" {...form.register("interval")} placeholder="e.g., 1 = every, 2 = every other" /> {errors.interval && <p className="text-sm text-destructive">{errors.interval.message}</p>} </div>
                             <div className="space-y-2 col-span-2">
                                 <Label htmlFor="start_date">Start Date</Label>
                                <Controller name="start_date" control={control} render={({ field }) => ( <Popover> <PopoverTrigger asChild> <Button variant={"outline"} className={cn( "w-full justify-start text-left font-normal", !field.value && "text-muted-foreground" )}> <span className="flex items-center w-full"> <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" /> <span className="truncate flex-grow"> {field.value ? format(field.value, "PPP") : "Pick a date"} </span> </span> </Button> </PopoverTrigger> <PopoverContent className="w-auto p-0"> <Calendar mode="single" selected={field.value} onSelect={(date) => field.onChange(date ? startOfDay(date) : undefined)} initialFocus /> </PopoverContent> </Popover> )}/>
                                {errors.start_date && <p className="text-sm text-destructive">{errors.start_date.message}</p>}
                            </div>
                             <div className="space-y-2 col-span-2">
                                 <Label htmlFor="end_date">End Date (Optional)</Label>
                                 <Controller name="end_date" control={control} render={({ field }) => ( <Popover> <PopoverTrigger asChild> <Button variant={"outline"} className={cn( "w-full justify-start text-left font-normal", !field.value && "text-muted-foreground" )}> <span className="flex items-center w-full"> <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" /> <span className="truncate flex-grow"> {field.value ? format(field.value, "PPP") : "Never / Pick date"} </span> </span> </Button> </PopoverTrigger> <PopoverContent className="w-auto p-0"> <Calendar mode="single" selected={field.value ?? undefined} onSelect={(date) => field.onChange(date ? startOfDay(date) : null)} initialFocus /> {field.value && ( <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => field.onChange(null)}> Clear End Date </Button> )} </PopoverContent> </Popover> )}/>
                                {errors.end_date && <p className="text-sm text-destructive">{errors.end_date.message}</p>}
                             </div>
                        </div>
                        {/* Split Details */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="paid_by_user_id">Payer</Label>
                                <Controller name="paid_by_user_id" control={control} render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ""}> {/* Ensure value is not null/undefined */}
                                        <SelectTrigger id="paid_by_user_id"><SelectValue placeholder="Select who pays initially..." /></SelectTrigger>
                                        <SelectContent>
                                            {memberProfiles.map((profile) => (
                                                <SelectItem key={profile.id} value={profile.id}>
                                                    {profile.first_name} {profile.last_name} {profile.id === user?.id ? '(You)' : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}/>
                                {errors.paid_by_user_id && <p className="text-sm text-destructive">{errors.paid_by_user_id.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="split_method">Split Method</Label>
                                <Controller name="split_method" control={control} render={({ field }) => (
                                    // Corrected: Use SplitMethod enum
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger id="split_method"><SelectValue placeholder="Select split method..." /></SelectTrigger>
                                        <SelectContent>
                                            {Object.values(SplitMethod).map((value) => (
                                                <SelectItem key={value} value={value}>
                                                    {formatEnumForDisplay(value)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}/>
                                {errors.split_method && <p className="text-sm text-destructive">{errors.split_method.message}</p>}
                            </div>
                        </div>
                        {/* Conditional Split Inputs */}
                        {watchedSplitMethod === SplitMethod.Percentage && ( // Corrected: Use enum
                            <div className="space-y-3 p-3 border rounded-md bg-slate-50 dark:bg-slate-800">
                                <Label>Percentage Splits (%)</Label>
                                {memberProfiles.map(profile => (
                                    <div key={profile.id} className="flex items-center space-x-2">
                                        <Label htmlFor={`percentage_${profile.id}`} className="flex-1">{profile.first_name} {profile.last_name}</Label>
                                        <Controller
                                            name={`percentage_splits.${profile.id}` as const} // Keep key structure
                                            control={control}
                                            render={({ field }) => (
                                                <Input
                                                    id={`percentage_${profile.id}`}
                                                    type="number" step="0.01" min="0" max="100"
                                                    {...field}
                                                    onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                                                    value={field.value ?? ''} // Handle null/undefined for controlled input
                                                    className="w-24" placeholder="0"/>
                                            )}
                                        />
                                    </div>
                                ))}
                                {/* Access potential error message at the root of percentage_splits */}
                                {errors.percentage_splits?.message && typeof errors.percentage_splits.message === 'string' && (
                                    <p className="text-sm text-destructive">{errors.percentage_splits.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground">Enter percentages. Must total 100%.</p>
                            </div>
                        )}
                        {watchedSplitMethod === SplitMethod.Custom && ( // Corrected: Use enum
                            <div className="space-y-3 p-3 border rounded-md bg-slate-50 dark:bg-slate-800">
                                <Label>Custom Splits ($)</Label>
                                {memberProfiles.map(profile => (
                                    <div key={profile.id} className="flex items-center space-x-2">
                                        <Label htmlFor={`custom_${profile.id}`} className="flex-1">{profile.first_name} {profile.last_name}</Label>
                                        <Controller
                                            name={`custom_splits.${profile.id}` as const} // Keep key structure
                                            control={control}
                                            render={({ field }) => (
                                                <Input
                                                    id={`custom_${profile.id}`}
                                                    type="number" step="0.01" min="0"
                                                    {...field}
                                                    onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                                                    value={field.value ?? ''} // Handle null/undefined for controlled input
                                                    className="w-24" placeholder="0.00"/>
                                            )}
                                        />
                                    </div>
                                ))}
                                {/* Access potential error message at the root of custom_splits */}
                                {errors.custom_splits?.message && typeof errors.custom_splits.message === 'string' && (
                                     <p className="text-sm text-destructive">{errors.custom_splits.message}</p>
                                 )}
                                <p className="text-xs text-muted-foreground">Enter amounts. Must total ${watchedAmount?.toFixed(2) ?? '0.00'}.</p>
                            </div>
                        )}
                        {/* Notes */}
                        <div className="space-y-2"> <Label htmlFor="notes">Notes (Optional)</Label> <Textarea id="notes" {...form.register("notes")} placeholder="Add relevant details or instructions..." /> {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>} </div>
                        {/* Active Status */}
                        <div className="flex items-center space-x-2 pt-2"> <Controller name="is_active" control={control} render={({ field }) => ( <Checkbox id="is_active" checked={field.value} onCheckedChange={field.onChange}/> )}/> <Label htmlFor="is_active" className="cursor-pointer"> Activate this template immediately </Label> {errors.is_active && <p className="text-sm text-destructive">{errors.is_active.message}</p>} </div>
                    </form>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={isLoading}>Cancel</Button>
                    </DialogClose>
                    <Button type="submit" form="add-recurring-expense-form" disabled={isLoading}>
                         {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {/* Added Loader */}
                         {saveButtonText}
                    </Button>
                 </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}