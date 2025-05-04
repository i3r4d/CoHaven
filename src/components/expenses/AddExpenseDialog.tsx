// src/components/expenses/AddExpenseDialog.tsx
// v5 - FIX: Calculate and provide amount/status for Equal splits to prevent P0001 DB error.

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid as isValidDate, parseISO } from 'date-fns';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Percent, AlertCircle, Paperclip, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useExpenses, ExpenseFormValues } from '@/contexts/ExpenseContext'; // Context type is updated
import {
    ExpenseCategory, SplitMethod, Profile, SplitMethodType,
    ExpenseCategoryType, PropertyMemberWithProfile,
    SplitStatus // Import SplitStatus enum
} from '@/integrations/supabase/types';
import { cn, getInitials, formatCurrency, formatCategoryName } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from '@/hooks/use-toast';


const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const ACCEPTED_FILE_EXTENSIONS = ".jpg, .jpeg, .png, .webp, .pdf";

// Schema remains the same - validation happens before DB function check
const expenseFormSchema = z.object({
    description: z.string().min(1, { message: "Description is required." }).trim(),
    amount: z.coerce.number({ invalid_type_error: 'Amount must be a number', required_error: "Amount is required." })
             .positive({ message: "Amount must be positive." })
             .multipleOf(0.01, { message: "Amount must have at most two decimal places." })
             .nullable()
             .refine(val => val !== null, { message: "Amount is required." }),
    date: z.date({ required_error: "Date is required.", invalid_type_error: "Invalid date." }),
    category: z.nativeEnum(ExpenseCategory, { required_error: "Please select a category." }),
    paid_by_user_id: z.string().uuid({ message: "Please select who paid." }),
    split_method: z.nativeEnum(SplitMethod, { required_error: "Please select a split method." }),
    notes: z.string().max(500, { message: "Notes must not exceed 500 characters." }).optional().nullable(),
    percentage_splits: z.record(z.string().uuid(), z.coerce.number().nonnegative("Percentage must be non-negative.").nullable()).optional(),
    custom_splits: z.record(z.string().uuid(), z.coerce.number().nonnegative("Amount must be non-negative.").nullable()).optional(),
    receipt_file: z.custom<File | null>( (file) => file === null || file instanceof File, "Invalid file type." )
        .optional().nullable()
        .refine( (file) => !file || file.size <= MAX_FILE_SIZE_BYTES, `Max file size is ${MAX_FILE_SIZE_MB}MB.` )
        .refine( (file) => !file || ACCEPTED_MIME_TYPES.includes(file.type), "Only JPG, PNG, WEBP and PDF files are accepted." ),
})
.refine(data => {
    if (data.split_method === SplitMethod.Percentage) {
        if (!data.percentage_splits) return false;
        const values = Object.values(data.percentage_splits).filter((v): v is number => typeof v === 'number' && v > 0);
        if (values.length === 0) return false;
        const totalPercent = values.reduce((sum, v) => sum + v, 0);
        return Math.abs(totalPercent - 100) < 0.01;
    } return true;
}, { message: "Percentages must add up to 100%.", path: ["percentage_splits"] })
.refine(data => {
    if (data.split_method === SplitMethod.Fixed) {
        const totalAmount = data.amount ?? 0;
        if (totalAmount <= 0) return true;
        if (!data.custom_splits) return false;
        const values = Object.values(data.custom_splits).filter((v): v is number => typeof v === 'number' && v > 0);
        if (values.length === 0) return false;
        const totalCustomAmount = values.reduce((sum, v) => sum + v, 0);
        return Math.abs(totalCustomAmount - totalAmount) < 0.01;
    } return true;
}, (data) => ({ message: `Fixed amounts must add up to ${formatCurrency(data.amount)}.`, path: ["custom_splits"] }));


type ExpenseFormData = z.infer<typeof expenseFormSchema>;
interface AddExpenseDialogProps { isOpen: boolean; onOpenChange: (isOpen: boolean) => void; }


const AddExpenseDialog: React.FC<AddExpenseDialogProps> = ({ isOpen, onOpenChange }) => {
    const { user } = useAuth();
    const { selectedProperty, propertyMembers } = useProperty();
    const { addExpenseWithSplits } = useExpenses();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const isInitialRenderOrReset = useRef(true);

    const memberProfiles = useMemo(() =>
        Array.isArray(propertyMembers) ? propertyMembers as PropertyMemberWithProfile[] : [],
        [propertyMembers]
    );

    const uniqueSortedMemberProfiles = useMemo(() => {
        if (!Array.isArray(memberProfiles)) return [];
        const uniqueMembers = new Map<string, PropertyMemberWithProfile>();
        memberProfiles.forEach(member => {
            if (member.user_id && member.profile && !uniqueMembers.has(member.user_id)) {
                uniqueMembers.set(member.user_id, member);
            }
        });
        return Array.from(uniqueMembers.values()).sort((a, b) => {
            const nameA = `${a.profile?.first_name || ''} ${a.profile?.last_name || ''}`.trim().toLowerCase();
            const nameB = `${b.profile?.first_name || ''} ${b.profile?.last_name || ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [memberProfiles]);

    const { register, handleSubmit, control, reset, formState: { errors, isValid }, setValue, trigger, getValues } = useForm<ExpenseFormData>({
        resolver: zodResolver(expenseFormSchema),
        defaultValues: {
            description: "", amount: null, date: new Date(), category: undefined,
            paid_by_user_id: user?.id || undefined,
            split_method: SplitMethod.Equal,
            notes: "", percentage_splits: {}, custom_splits: {}, receipt_file: null,
        },
        mode: 'onChange',
    });

    const selectedSplitMethod = useWatch({ control, name: 'split_method' });
    const totalAmount = useWatch({ control, name: 'amount' });

    useEffect(() => {
        if (isOpen) {
            console.log("AddExpenseDialog: Resetting form state.");
            const initialSplits: Record<string, null> = {};
            uniqueSortedMemberProfiles.forEach(member => {
               if(member.user_id) initialSplits[member.user_id] = null;
            });
            reset({
                description: "", amount: null, date: new Date(), category: undefined,
                paid_by_user_id: user?.id || undefined,
                split_method: SplitMethod.Equal,
                notes: "", percentage_splits: initialSplits, custom_splits: initialSplits, receipt_file: null,
            }, { keepDefaultValues: false });
            setSelectedFileName(null);
            if (fileInputRef.current) { fileInputRef.current.value = ""; }
            isInitialRenderOrReset.current = true;
            setIsSubmitting(false);
        }
    }, [isOpen, user?.id, uniqueSortedMemberProfiles, reset]);

    const stableMemberIds = useMemo(() => {
        return uniqueSortedMemberProfiles.map(m => m.user_id).filter(id => !!id).sort().join(',');
    }, [uniqueSortedMemberProfiles]);

     useEffect(() => {
        if (isInitialRenderOrReset.current) { isInitialRenderOrReset.current = false; return; }
        if (uniqueSortedMemberProfiles.length === 0) return;
        console.log(`Add Dialog: Split method changed to ${selectedSplitMethod}. Updating related fields.`);
        const initialSplits: Record<string, null> = {};
        uniqueSortedMemberProfiles.forEach(member => { if(member.user_id) initialSplits[member.user_id] = null; });
        const currentPercSplits = getValues('percentage_splits');
        const currentCustSplits = getValues('custom_splits');
        const hasPercValues = currentPercSplits && Object.values(currentPercSplits).some(v => v !== null);
        const hasCustValues = currentCustSplits && Object.values(currentCustSplits).some(v => v !== null);

        if (selectedSplitMethod === SplitMethod.Percentage) {
            if (hasCustValues) { setValue('custom_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
             trigger("percentage_splits");
        } else if (selectedSplitMethod === SplitMethod.Fixed) {
            if (hasPercValues) { setValue('percentage_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
             trigger("custom_splits");
        } else {
            // For Equal or Payer Only, clear both custom fields if they had values
            if (hasPercValues) { setValue('percentage_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
            if (hasCustValues) { setValue('custom_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
        }
    }, [selectedSplitMethod, stableMemberIds, setValue, trigger, getValues, uniqueSortedMemberProfiles]);


    // *** onSubmit Handler - Modified to calculate Equal splits ***
    const onSubmit = async (data: ExpenseFormData) => {
        console.log("Form Data Submitted:", data);
        const currentAmount = Number(data.amount) || 0;

        // Basic validation
        if (!selectedProperty || !user || !data.paid_by_user_id || !data.category || !data.split_method || !data.date) {
             toast({ title: "Validation Error", description: "Missing required information.", variant: "destructive" }); return;
        }
        if (currentAmount <= 0 && data.split_method !== SplitMethod.PayerOnly) { // Allow 0 amount only for PayerOnly? Decide based on requirements. For now, disallow 0 for splits.
             toast({ title: "Validation Error", description: "Amount must be positive for splitting.", variant: "destructive" }); return;
        }
        if (uniqueSortedMemberProfiles.length === 0 && [SplitMethod.Equal, SplitMethod.Percentage, SplitMethod.Fixed].includes(data.split_method)) {
            toast({ title: "Error", description: `Cannot split by ${data.split_method} with no members.`, variant: "destructive" }); return;
        }
        setIsSubmitting(true);

        // Prepare base payload for context
        const contextPayload: ExpenseFormValues = {
            date: data.date,
            description: data.description,
            amount: currentAmount,
            category: data.category as ExpenseCategoryType,
            paid_by_user_id: data.paid_by_user_id,
            split_method: data.split_method as SplitMethodType,
            notes: data.notes || null,
            receipt_url: null, // Receipt URL handled separately if needed later
            splits: [] // Initialize empty splits array
        };

        // --- Populate contextPayload.splits based on method ---

        try { // Wrap split calculation in try/catch for safety
            if (data.split_method === SplitMethod.Percentage && data.percentage_splits) {
                contextPayload.splits = uniqueSortedMemberProfiles
                    .filter(member => data.percentage_splits![member.user_id] != null && data.percentage_splits![member.user_id]! > 0)
                    .map(member => {
                        const userId = member.user_id;
                        const percentage = data.percentage_splits![userId]!;
                        // Calculate amount based on percentage
                        const amount = (currentAmount * percentage) / 100;
                        // Determine status
                        const status = userId === data.paid_by_user_id ? SplitStatus.Paid : SplitStatus.Owed;
                        return { user_id: userId, amount: amount, percentage: percentage, status: status }; // Include amount, percentage, status
                    });
            } else if (data.split_method === SplitMethod.Fixed && data.custom_splits) {
                contextPayload.splits = uniqueSortedMemberProfiles
                    .filter(member => data.custom_splits![member.user_id] != null && data.custom_splits![member.user_id]! > 0)
                    .map(member => {
                        const userId = member.user_id;
                        const amount = data.custom_splits![userId]!;
                        // Determine status
                        const status = userId === data.paid_by_user_id ? SplitStatus.Paid : SplitStatus.Owed;
                        return { user_id: userId, amount: amount, status: status }; // Include amount, status
                    });
            } else if (data.split_method === SplitMethod.Equal) {
                const numberOfMembers = uniqueSortedMemberProfiles.length;
                if (numberOfMembers === 0) { throw new Error("Cannot perform equal split with zero members."); }

                // Calculate equal amount, handle potential division by zero and rounding
                const rawEqualAmount = currentAmount / numberOfMembers;
                // Round to 2 decimal places to avoid floating point issues
                const equalAmount = parseFloat(rawEqualAmount.toFixed(2));

                // Check if rounding caused a significant difference (optional sanity check)
                const totalRoundedAmount = equalAmount * numberOfMembers;
                 if (Math.abs(totalRoundedAmount - currentAmount) > 0.01 * numberOfMembers) { // Allow small tolerance per member
                    console.warn(`Rounding difference detected in equal split. Original: ${currentAmount}, Total Rounded: ${totalRoundedAmount}`);
                    // Potentially adjust the last split amount, but for now, proceed with rounded value.
                }

                contextPayload.splits = uniqueSortedMemberProfiles.map(member => {
                    const userId = member.user_id;
                    // Determine status
                    const status = userId === data.paid_by_user_id ? SplitStatus.Paid : SplitStatus.Owed;
                    // Return object with user_id, calculated amount, and status
                    return { user_id: userId, amount: equalAmount, status: status };
                });
            } else if (data.split_method === SplitMethod.PayerOnly) {
                 // Payer Only means only the payer has a split, marked as paid.
                 contextPayload.splits = [{
                     user_id: data.paid_by_user_id,
                     amount: currentAmount, // The full amount is attributed to the payer
                     status: SplitStatus.Paid
                 }];
            }

             // Add a final validation: ensure splits array is not empty if amount > 0
            if (currentAmount > 0 && contextPayload.splits.length === 0 && data.split_method !== SplitMethod.PayerOnly /*Allow PayerOnly to potentially have 0 splits if amount=0*/) {
                throw new Error(`Split calculation resulted in empty splits array for method ${data.split_method}.`);
            }

        } catch (splitError: any) {
             console.error("Error calculating splits:", splitError);
             toast({ title: "Split Calculation Error", description: splitError.message || "Could not prepare split data.", variant: "destructive" });
             setIsSubmitting(false); // Stop submission
             return; // Exit onSubmit
        }


        console.log("Calling addExpenseWithSplits context function with calculated payload:", contextPayload);

        try {
            // --- TODO: Proper Receipt Upload Logic ---
             if (data.receipt_file) {
                console.warn("Receipt file detected, but upload logic is not implemented. Receipt will not be saved.");
                 // Set contextPayload.receipt_url here if upload is successful BEFORE calling addExpenseWithSplits
            }
            // --- End Receipt Upload Placeholder ---

            // Call context function with the prepared payload
            const { error: contextError } = await addExpenseWithSplits(contextPayload);

            if (!contextError) {
                toast({ title: "Success", description: `Expense "${data.description}" added.` });
                onOpenChange(false);
            } else {
                // Error already handled and toasted within context function
                // No need to re-throw unless specific handling needed here
                console.error("Error returned from addExpenseWithSplits context function:", contextError);
            }
        } catch (submitError) {
             // Catch any unexpected errors during the submission process itself
             console.error("Unexpected error submitting expense form:", submitError);
             toast({ title: "Submission Error", description: submitError instanceof Error ? submitError.message : "An unknown error occurred during submission.", variant: "destructive" });
        } finally {
             // Ensure isSubmitting is reset even if the dialog stays open on error
             // Check if component is still mounted before resetting state if needed,
             // but for a dialog controlled by isOpen, resetting is usually safe.
             if (isOpen) { setIsSubmitting(false); }
        }
    };
    // *** End onSubmit Handler ***


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
         const file = event.target.files?.[0] ?? null;
         if (file) {
             setValue('receipt_file', file, { shouldValidate: true, shouldDirty: true });
             trigger('receipt_file').then(isValidFile => {
                 if (isValidFile) { setSelectedFileName(file.name); }
                 else { setSelectedFileName(null); handleClearFile(); }
             });
         } else { handleClearFile(); }
     };
    const handleClearFile = () => {
         setValue('receipt_file', null, { shouldValidate: true, shouldDirty: true });
         setSelectedFileName(null);
         if (fileInputRef.current) { fileInputRef.current.value = ""; }
     };
    const getInputClassName = (hasError: boolean): string => cn("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", hasError && "border-destructive focus-visible:ring-destructive");
    const getSelectClassName = (hasError: boolean): string => cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", hasError && "border-destructive focus-visible:ring-destructive");
    const getTextareaClassName = (hasError: boolean): string => cn("flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none", hasError && "border-destructive focus-visible:ring-destructive");


    // --- Render Logic (No changes needed here) ---
    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (isSubmitting && !open) return; if (!open) { setIsSubmitting(false); } onOpenChange(open); }}>
             <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                 <DialogHeader> <DialogTitle>Add New Expense</DialogTitle> <DialogDescription> Enter expense details for {selectedProperty?.name || 'your property'}. </DialogDescription> </DialogHeader>
                 <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-4">
                     {/* Description */}
                     <div className="space-y-2"> <Label htmlFor="description" className={cn(errors.description && "text-destructive")}>Description *</Label> <Input id="description" placeholder="e.g., Monthly HOA Fee" {...register("description")} className={getInputClassName(!!errors.description)} aria-invalid={!!errors.description} /> {errors.description && <p className="text-sm font-medium text-destructive">{errors.description.message}</p>} </div>
                     {/* Amount */}
                     <div className="space-y-2"> <Label htmlFor="amount" className={cn(errors.amount && "text-destructive")}>Amount *</Label> <Controller name="amount" control={control} render={({ field: { onChange, ...rest } }) => ( <Input id="amount" type="number" step="0.01" placeholder="0.00" onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))} {...rest} value={rest.value ?? ''} className={getInputClassName(!!errors.amount)} aria-invalid={!!errors.amount} /> )} /> {errors.amount && <p className="text-sm font-medium text-destructive">{errors.amount.message}</p>} </div>
                     {/* Date */}
                     <div className="space-y-2"> <Label htmlFor="date" className={cn(errors.date && "text-destructive")}>Date *</Label> <Controller name="date" control={control} render={({ field }) => ( <input id="date" type="date" onChange={(e) => field.onChange(e.target.valueAsDate)} onBlur={field.onBlur} value={field.value instanceof Date && isValidDate(field.value) ? format(field.value, 'yyyy-MM-dd') : ''} ref={field.ref} name={field.name} className={getInputClassName(!!errors.date)} aria-invalid={!!errors.date} /> )} /> {errors.date && <p className="text-sm font-medium text-destructive">{typeof errors.date.message === 'string' ? errors.date.message : 'Invalid Date'}</p>} </div>
                     {/* Category */}
                     <div className="space-y-2"> <Label htmlFor="category" className={cn(errors.category && "text-destructive")}>Category *</Label> <select id="category" {...register("category")} className={getSelectClassName(!!errors.category)} defaultValue="" aria-invalid={!!errors.category}> <option value="" disabled>Select a category</option> {Object.values(ExpenseCategory).map((cat) => ( <option key={String(cat)} value={String(cat)}>{formatCategoryName(cat)}</option> ))} </select> {errors.category && <p className="text-sm font-medium text-destructive">{errors.category.message}</p>} </div>
                     {/* Paid By */}
                     <div className="space-y-2">
                         <Label htmlFor="paid_by_user_id" className={cn(errors.paid_by_user_id && "text-destructive")}>Paid By *</Label>
                         <select id="paid_by_user_id" {...register("paid_by_user_id")} className={getSelectClassName(!!errors.paid_by_user_id)} disabled={uniqueSortedMemberProfiles.length === 0} defaultValue={user?.id || ""} aria-invalid={!!errors.paid_by_user_id}>
                            <option value="" disabled>Select who paid</option>
                            {uniqueSortedMemberProfiles.map((member) => (
                                <option key={member.user_id} value={member.user_id}>
                                    {member.profile?.first_name} {member.profile?.last_name} {member.user_id === user?.id ? '(You)' : ''}
                                </option>
                            ))}
                         </select>
                         {errors.paid_by_user_id && <p className="text-sm font-medium text-destructive">{errors.paid_by_user_id.message}</p>}
                     </div>
                     {/* Split Method */}
                     <div className="space-y-2"> <Label className={cn(errors.split_method && "text-destructive")}>Split Method *</Label> <Controller name="split_method" control={control} render={({ field }) => ( <RadioGroup onValueChange={field.onChange} value={field.value} className={cn("flex flex-col space-y-1", errors.split_method && "rounded-md border border-destructive p-2")}> {Object.values(SplitMethod).map((val) => ( <div key={String(val)} className="flex items-center space-x-3 space-y-0"> <RadioGroupItem value={String(val)} id={`split-${String(val)}-${field.name}`} /> <Label htmlFor={`split-${String(val)}-${field.name}`} className="font-normal capitalize cursor-pointer">{String(val).replace(/_/g, ' ')}</Label> </div> ))} </RadioGroup> )} /> {errors.split_method && <p className="text-sm font-medium text-destructive">{errors.split_method.message}</p>} </div>

                     {/* Conditional Splits */}
                      {selectedSplitMethod === SplitMethod.Percentage && (
                         <div className="space-y-3 rounded-md border border-border p-4">
                             <Label className="font-medium">Split by Percentage</Label>
                             {errors.percentage_splits && typeof errors.percentage_splits.message === 'string' && ( <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs">{errors.percentage_splits.message}</AlertDescription></Alert> )}
                             <div className="space-y-2">
                                {uniqueSortedMemberProfiles.map((member) => (
                                    <div key={`perc-${member.user_id}`} className="flex items-center gap-3">
                                        <Avatar className="h-6 w-6"><AvatarImage src={member.profile?.avatar_url ?? undefined} /> <AvatarFallback>{getInitials(`${member.profile?.first_name ?? ''} ${member.profile?.last_name ?? ''}`)}</AvatarFallback></Avatar>
                                        <Label htmlFor={`percentage-${member.user_id}`} className="flex-1 text-sm">{member.profile?.first_name ?? ''} {member.profile?.last_name ?? ''} {member.user_id === user?.id ? '(You)' : ''}</Label>
                                        <div className="relative w-24">
                                            <Controller name={`percentage_splits.${member.user_id}`} control={control} render={({ field: { onChange, ...rest }, fieldState }) => ( <Input id={`percentage-${member.user_id}`} type="number" step="0.01" min="0" max="100" placeholder="0" onChange={(e) => { onChange(e.target.value === '' ? null : parseFloat(e.target.value)); trigger("percentage_splits"); }} {...rest} value={rest.value ?? ''} className={cn(getInputClassName(!!fieldState.error), "pr-7")} aria-invalid={!!fieldState.error} /> )} />
                                            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        </div>
                                    </div>
                                ))}
                             </div>
                         </div>
                     )}
                    {selectedSplitMethod === SplitMethod.Fixed && (
                        <div className="space-y-3 rounded-md border border-border p-4">
                            <Label className="font-medium">Split by Fixed Amount</Label>
                            {errors.custom_splits && typeof errors.custom_splits.message === 'string' && ( <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs">{errors.custom_splits.message}</AlertDescription></Alert> )}
                            {(!totalAmount || totalAmount <= 0) && ( <Alert variant="default" className="mt-2 border-yellow-500 text-yellow-700 [&>svg]:text-yellow-700"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs">Please enter a positive total expense amount first.</AlertDescription></Alert> )}
                            <div className="space-y-2">
                                {uniqueSortedMemberProfiles.map((member) => (
                                    <div key={`cust-${member.user_id}`} className="flex items-center gap-3">
                                        <Avatar className="h-6 w-6"><AvatarImage src={member.profile?.avatar_url ?? undefined} /> <AvatarFallback>{getInitials(`${member.profile?.first_name ?? ''} ${member.profile?.last_name ?? ''}`)}</AvatarFallback></Avatar>
                                        <Label htmlFor={`custom-${member.user_id}`} className="flex-1 text-sm">{member.profile?.first_name ?? ''} {member.profile?.last_name ?? ''} {member.user_id === user?.id ? '(You)' : ''}</Label>
                                        <Controller name={`custom_splits.${member.user_id}`} control={control} render={({ field: { onChange, ...rest }, fieldState }) => ( <Input id={`custom-${member.user_id}`} type="number" step="0.01" min="0" placeholder="0.00" onChange={(e) => { onChange(e.target.value === '' ? null : parseFloat(e.target.value)); trigger("custom_splits"); }} {...rest} value={rest.value ?? ''} className={cn(getInputClassName(!!fieldState.error), "w-24")} disabled={!totalAmount || totalAmount <= 0} aria-invalid={!!fieldState.error} /> )} />
                                    </div>
                                ))}
                             </div>
                         </div>
                     )}
                     {/* Notes */}
                     <div className="space-y-2"> <Label htmlFor="notes" className={cn(errors.notes && "text-destructive")}>Notes (Optional)</Label> <Textarea id="notes" placeholder="Add any relevant notes..." {...register("notes")} className={getTextareaClassName(!!errors.notes)} aria-invalid={!!errors.notes} /> {errors.notes && <p className="text-sm font-medium text-destructive">{errors.notes.message}</p>} </div>
                     {/* Receipt Upload */}
                     <div className="space-y-2">
                        <Label htmlFor="receipt_file_input" className={cn("cursor-pointer", errors.receipt_file && "text-destructive")}> Receipt (Optional) </Label>
                        <div className={cn( "flex items-center space-x-2 rounded-md border border-input pr-1", errors.receipt_file ? "border-destructive ring-destructive ring-1" : "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2" )}>
                            <Label htmlFor="receipt_file_input" className={cn( "inline-flex items-center justify-center whitespace-nowrap rounded-l-md text-sm font-medium h-10 px-3 py-2 cursor-pointer", "bg-transparent hover:bg-accent hover:text-accent-foreground border-r border-input", "ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" )}>
                                <Paperclip className="mr-2 h-4 w-4" aria-hidden="true" /> {selectedFileName ? 'Change' : 'Attach File'} </Label>
                            <input type="file" id="receipt_file_input" ref={fileInputRef} onChange={handleFileChange} accept={ACCEPTED_FILE_EXTENSIONS} className="sr-only" aria-invalid={!!errors.receipt_file} aria-describedby={errors.receipt_file ? "receipt-error-message" : undefined} />
                            <span className="flex-1 text-sm text-muted-foreground truncate px-2 py-2 h-10 flex items-center"> {selectedFileName ? selectedFileName : `Max ${MAX_FILE_SIZE_MB}MB (PDF, JPG, PNG, WEBP)`} </span>
                            {selectedFileName && ( <Button type="button" variant="ghost" size="icon" onClick={handleClearFile} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0" aria-label="Remove selected receipt file"> <XCircle className="h-4 w-4" /> </Button> )}
                        </div>
                        {errors.receipt_file && <p id="receipt-error-message" className="text-sm font-medium text-destructive">{errors.receipt_file.message}</p>}
                     </div>

                     {/* Footer */}
                     <DialogFooter className="pt-4"> <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}> Cancel </Button> <Button type="submit" disabled={isSubmitting || !isValid || !selectedProperty || !user}> {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : ("Save Expense")} </Button> </DialogFooter>
                 </form>
            </DialogContent>
        </Dialog>
    );
};

export default AddExpenseDialog;