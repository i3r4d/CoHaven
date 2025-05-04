// src/components/recurring-expenses/EditRecurringExpenseDialog.tsx
// v3 - Removed max-h constraint from ScrollArea to debug missing fields issue.

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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, startOfDay, parseISO, isValid as isValidDate } from 'date-fns';
import { cn } from "@/lib/utils";
import { useRecurringExpense } from '@/contexts/RecurringExpenseContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAuth } from '@/contexts/AuthContext';
import {
    RecurringExpenseFormData,
    RecurringExpense,
    RecurringExpenseCategory,
    SplitMethod,
    Frequency,
    Profile,
    Json,
} from '@/integrations/supabase/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

// --- Zod Validation Schema (No changes needed) ---
const recurringExpenseSchema = z.object({
    description: z.string().min(1, "Description is required"),
    amount: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number({ invalid_type_error: "Amount must be a number" }).positive("Amount must be positive")
    ),
    category: z.nativeEnum(RecurringExpenseCategory, { errorMap: () => ({ message: "Please select a category" }) }),
    frequency: z.nativeEnum(Frequency, { errorMap: () => ({ message: "Please select a frequency" }) }),
    interval: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number({ invalid_type_error: "Interval must be a number" }).int().min(1, "Interval must be at least 1")
    ),
    start_date: z.date({ required_error: "Start date is required" }),
    end_date: z.date().optional().nullable(),
    paid_by_user_id: z.string().uuid("Payer is required"),
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
.refine(data => { // Percentage Check
    if (data.split_method === SplitMethod.Percentage) {
        const total = Object.values(data.percentage_splits ?? {}).reduce((sum, val) => sum + (val ?? 0), 0);
        return Math.abs(total - 100) < 0.01;
    } return true;
}, { message: "Percentages must add up to 100%", path: ["percentage_splits"] })
.refine(data => { // Custom Check
    if (data.split_method === SplitMethod.Custom) {
        const total = Object.values(data.custom_splits ?? {}).reduce((sum, val) => sum + (val ?? 0), 0);
        const currentAmount = data.amount ?? 0;
        return Math.abs(total - currentAmount) < 0.01;
    } return true;
}, { message: "Custom amounts must add up to the total expense amount", path: ["custom_splits"] });


// --- Component Props ---
interface EditRecurringExpenseDialogProps {
    expenseToEdit: RecurringExpense | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

// Helper to parse split_details (No changes needed)
const parseSplitDetailsForForm = (split_details: Json | null | undefined, method: SplitMethod | undefined): { percentage_splits?: Record<string, number | null>, custom_splits?: Record<string, number | null> } => {
    // Simplified implementation for brevity in example
    if (!split_details || typeof split_details !== 'object') return {};
    // Basic parsing logic would go here...
    if (method === SplitMethod.Percentage && split_details && 'splits' in split_details) {
      return { percentage_splits: split_details.splits as Record<string, number | null> };
    }
    if (method === SplitMethod.Custom && split_details && 'splits' in split_details) {
      return { custom_splits: split_details.splits as Record<string, number | null> };
    }
    return {};
};

export function EditRecurringExpenseDialog({ expenseToEdit, isOpen, onOpenChange }: EditRecurringExpenseDialogProps) {
    const { updateRecurringExpense, isLoading: isContextLoading } = useRecurringExpense();
    const { memberProfiles = [] } = useProperty(); // Provide default empty array
    const { user } = useAuth();
    const { toast } = useToast();

    const defaultFormValues: Partial<RecurringExpenseFormData> = {
        description: "", amount: 0, category: undefined,
        frequency: Frequency.Monthly, interval: 1,
        start_date: startOfDay(new Date()), end_date: null,
        paid_by_user_id: undefined,
        split_method: SplitMethod.Equal,
        notes: "", percentage_splits: {}, custom_splits: {}, is_active: true,
    };

    const form = useForm<RecurringExpenseFormData>({
        resolver: zodResolver(recurringExpenseSchema),
        defaultValues: defaultFormValues as RecurringExpenseFormData, // Cast needed if partial isn't deep
    });

    const { handleSubmit, control, watch, reset, formState: { errors, isSubmitting: isFormSubmitting, isDirty }, setError } = form;

    const watchedSplitMethod = watch("split_method");
    const watchedAmount = watch("amount");
    const isLoading = isFormSubmitting || isContextLoading;

    // --- Effect to Populate Form (No changes needed) ---
    useEffect(() => {
        if (expenseToEdit && isOpen) {
            let startDate: Date | undefined;
            let endDate: Date | null = null;
            try { startDate = expenseToEdit.start_date && isValidDate(parseISO(expenseToEdit.start_date)) ? parseISO(expenseToEdit.start_date) : startOfDay(new Date()); }
            catch { startDate = startOfDay(new Date()); }
            try { endDate = expenseToEdit.end_date && isValidDate(parseISO(expenseToEdit.end_date)) ? parseISO(expenseToEdit.end_date) : null; }
            catch { endDate = null; }

            const splitFormValues = parseSplitDetailsForForm(expenseToEdit.split_details, expenseToEdit.split_method);

            reset({
                description: expenseToEdit.description ?? '',
                amount: expenseToEdit.amount ?? 0,
                category: expenseToEdit.category,
                frequency: expenseToEdit.frequency,
                interval: expenseToEdit.interval ?? 1,
                start_date: startDate,
                end_date: endDate,
                paid_by_user_id: expenseToEdit.paid_by_user_id ?? (user?.id ?? undefined), // Fallback if missing, ensure required
                split_method: expenseToEdit.split_method,
                notes: expenseToEdit.notes ?? "",
                percentage_splits: splitFormValues.percentage_splits ?? {},
                custom_splits: splitFormValues.custom_splits ?? {},
                is_active: expenseToEdit.is_active ?? true,
            });
        }
    }, [expenseToEdit, isOpen, reset, user]);

    // --- Submission Handler (No changes needed) ---
    const onSubmit = async (data: RecurringExpenseFormData) => {
        if (!expenseToEdit || !expenseToEdit.id) {
            toast({ title: "Error", description: "No expense selected for editing or ID missing.", variant: "destructive"});
            return;
        }
        if (!isDirty) {
            toast({ title: "No Changes", description: "No changes were made to the template.", variant: "default" });
            onOpenChange(false);
            return;
        }
        if (!data.paid_by_user_id) {
             setError("paid_by_user_id", { type: "manual", message: "Payer selection is required." });
             return;
        }
        console.log(`Submitting update for recurring expense ID: ${expenseToEdit.id}`, data);
        const success = await updateRecurringExpense(expenseToEdit.id, data);
        if (success) {
            onOpenChange(false);
            toast({ title: "Success", description: "Recurring expense template updated." });
        }
    };

    // Helper to format enum keys/values for display (No changes needed)
    const formatEnumForDisplay = (enumValue: string): string => {
        if (!enumValue) return '';
        return enumValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh]"> {/* Keep max-h on DialogContent */}
                <DialogHeader>
                    <DialogTitle>Edit Recurring Expense Template</DialogTitle>
                    <DialogDescription> Modify the details and schedule for this template. </DialogDescription>
                </DialogHeader>
                {!expenseToEdit && isOpen ? (
                     <div className="flex items-center justify-center py-10"><p>Loading expense data...</p></div>
                ) : (
                    // --- MODIFIED ScrollArea: Removed max-h class ---
                     <ScrollArea className="overflow-y-auto pr-6">
                        <form id="edit-recurring-expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4 pl-1">
                            {/* --- Basic Details Fields --- */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 col-span-2"> <Label htmlFor="edit-description">Description</Label> <Input id="edit-description" {...form.register("description")} placeholder="e.g., Monthly Rent" /> {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>} </div>
                                <div className="space-y-2"> <Label htmlFor="edit-amount">Amount ($)</Label> <Input id="edit-amount" type="number" step="0.01" {...form.register("amount")} placeholder="0.00" /> {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>} </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-category">Category</Label>
                                    <Controller name="category" control={control} render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger id="edit-category"><SelectValue placeholder="Select category..." /></SelectTrigger>
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
                            {/* --- Schedule Details Fields --- */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="edit-frequency">Frequency</Label>
                                    <Controller name="frequency" control={control} render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger id="edit-frequency"><SelectValue placeholder="Select frequency..." /></SelectTrigger>
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
                                <div className="space-y-2 col-span-2"> <Label htmlFor="edit-interval">Interval</Label> <Input id="edit-interval" type="number" min="1" step="1" {...form.register("interval")} placeholder="e.g., 1 = every" /> {errors.interval && <p className="text-sm text-destructive">{errors.interval.message}</p>} </div>
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="edit-start_date">Start Date</Label>
                                    <Controller name="start_date" control={control} render={({ field }) => (
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                                    <span> {/* Outer span */}
                                                        <span className="flex items-center w-full">
                                                            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                                                            <span className="truncate flex-grow">{field.value ? format(field.value, "PPP") : "Pick a date"}</span>
                                                        </span>
                                                    </span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0"> <Calendar mode="single" selected={field.value} onSelect={(date) => field.onChange(date ? startOfDay(date) : undefined)} initialFocus /> </PopoverContent>
                                        </Popover>
                                    )}/>
                                    {errors.start_date && <p className="text-sm text-destructive">{errors.start_date.message}</p>}
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="edit-end_date">End Date (Optional)</Label>
                                    <Controller name="end_date" control={control} render={({ field }) => (
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                 <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                                    <span> {/* Outer span */}
                                                         <span className="flex items-center w-full">
                                                             <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                                                             <span className="truncate flex-grow">{field.value ? format(field.value, "PPP") : "Never / Pick date"}</span>
                                                         </span>
                                                     </span>
                                                 </Button>
                                             </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar mode="single" selected={field.value ?? undefined} onSelect={(date) => field.onChange(date ? startOfDay(date) : null)} initialFocus />
                                                {field.value && ( <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => field.onChange(null)}>Clear End Date</Button> )}
                                            </PopoverContent>
                                        </Popover>
                                    )}/>
                                    {errors.end_date && <p className="text-sm text-destructive">{errors.end_date.message}</p>}
                                </div>
                            </div>
                            {/* --- Split Details Fields --- */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-paid_by_user_id">Payer</Label>
                                    <Controller name="paid_by_user_id" control={control} render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                            <SelectTrigger id="edit-paid_by_user_id"><SelectValue placeholder="Select who pays initially..." /></SelectTrigger>
                                            <SelectContent>
                                                {memberProfiles.map((profile) => (
                                                    <SelectItem key={profile.id} value={profile.id}> {/* Assuming profile has 'id' */}
                                                        {profile.first_name} {profile.last_name} {profile.id === user?.id ? '(You)' : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}/>
                                    {errors.paid_by_user_id && <p className="text-sm text-destructive">{errors.paid_by_user_id.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-split_method">Split Method</Label>
                                    <Controller name="split_method" control={control} render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger id="edit-split_method"><SelectValue placeholder="Select split method..." /></SelectTrigger>
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
                            {/* --- Conditional Split Inputs --- */}
                            {watchedSplitMethod === SplitMethod.Percentage && (
                                <div className="space-y-3 p-3 border rounded-md bg-slate-50 dark:bg-slate-800">
                                    <Label>Percentage Splits (%)</Label>
                                    {memberProfiles.map(profile => (
                                        <div key={profile.id} className="flex items-center space-x-2">
                                            <Label htmlFor={`edit-percentage_${profile.id}`} className="flex-1">{profile.first_name} {profile.last_name}</Label>
                                            <Controller name={`percentage_splits.${profile.id}` as const} control={control} render={({ field }) => (
                                                <Input id={`edit-percentage_${profile.id}`} type="number" step="0.01" min="0" max="100" {...field} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} value={field.value ?? ''} className="w-24" placeholder="0"/>
                                            )}/>
                                        </div>
                                    ))}
                                    {errors.percentage_splits?.message && typeof errors.percentage_splits.message === 'string' && (
                                        <p className="text-sm text-destructive">{errors.percentage_splits.message}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">Enter percentages. Must total 100%.</p>
                                </div>
                             )}
                            {watchedSplitMethod === SplitMethod.Custom && (
                                <div className="space-y-3 p-3 border rounded-md bg-slate-50 dark:bg-slate-800">
                                    <Label>Custom Splits ($)</Label>
                                    {memberProfiles.map(profile => (
                                        <div key={profile.id} className="flex items-center space-x-2">
                                            <Label htmlFor={`edit-custom_${profile.id}`} className="flex-1">{profile.first_name} {profile.last_name}</Label>
                                            <Controller name={`custom_splits.${profile.id}` as const} control={control} render={({ field }) => (
                                                <Input id={`edit-custom_${profile.id}`} type="number" step="0.01" min="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} value={field.value ?? ''} className="w-24" placeholder="0.00"/>
                                            )}/>
                                        </div>
                                    ))}
                                    {errors.custom_splits?.message && typeof errors.custom_splits.message === 'string' && (
                                         <p className="text-sm text-destructive">{errors.custom_splits.message}</p>
                                     )}
                                    <p className="text-xs text-muted-foreground">Enter amounts. Must total ${typeof watchedAmount === 'number' ? watchedAmount.toFixed(2) : '0.00'}.</p>
                                </div>
                             )}
                            {/* --- Notes Field --- */}
                            <div className="space-y-2"> <Label htmlFor="edit-notes">Notes (Optional)</Label> <Textarea id="edit-notes" {...form.register("notes")} placeholder="Add relevant details or instructions..." /> {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>} </div>
                            {/* --- Active Status Field --- */}
                            <div className="flex items-center space-x-2 pt-2"> <Controller name="is_active" control={control} render={({ field }) => ( <Checkbox id="edit-is_active" checked={field.value ?? true} onCheckedChange={field.onChange}/> )}/> <Label htmlFor="edit-is_active" className="cursor-pointer"> Template is Active </Label> {errors.is_active && <p className="text-sm text-destructive">{errors.is_active.message}</p>} </div>
                        </form>
                     </ScrollArea>
                 )}
                 <DialogFooter>
                     <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
                     <Button type="submit" form="edit-recurring-expense-form" disabled={isLoading || !expenseToEdit || !isDirty}>
                         {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                         Save Changes
                     </Button>
                 </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}