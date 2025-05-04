// src/components/expenses/EditExpenseDialog.tsx
// v5 - FIX: Restore input styling. Ensure initial validation passes.
//    - Restored full class lists in cn() helper functions.
//    - Adjusted useEffect population for required fields (category, paid_by_user_id) for better initial validation state.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, isValid as isValidDate } from 'date-fns';

import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Percent, AlertCircle, Paperclip, XCircle, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useExpenses, ExpenseFormValues } from '@/contexts/ExpenseContext';
import {
    ExpenseCategory,
    SplitMethod,
    Profile,
    Expense,
    ExpenseSplitWithProfile,
    SplitMethodType,
    ExpenseCategoryType,
    PropertyMemberWithProfile,
    SplitStatus
} from '@/integrations/supabase/types';
import { cn, getInitials, formatCurrency, formatCategoryName } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// --- Config, Schema, Types remain the same ---
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const ACCEPTED_FILE_EXTENSIONS = ".jpg, .jpeg, .png, .webp, .pdf";

const expenseFormSchema = z.object({
    description: z.string().min(1, { message: "Description is required." }).trim(),
    amount: z.coerce.number({ invalid_type_error: 'Amount must be a number', required_error: "Amount is required." })
             .positive({ message: "Amount must be positive." })
             .multipleOf(0.01, { message: "Amount must have at most two decimal places." })
             .nullable()
             .refine(val => val !== null, { message: "Amount is required." }),
    date: z.date({ required_error: "Date is required.", invalid_type_error: "Invalid date.", }),
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
    remove_receipt: z.boolean().optional(),
    existing_receipt_url: z.string().nullable().optional(),
})
.refine(data => { /* Percentage validation */
    if (data.split_method === SplitMethod.Percentage) {
        if (!data.percentage_splits) return false;
        const values = Object.values(data.percentage_splits).filter((v): v is number => typeof v === 'number' && v > 0);
        if (values.length === 0) return false; // Require at least one positive percentage
        const totalPercent = values.reduce((sum, v) => sum + v, 0);
        return Math.abs(totalPercent - 100) < 0.01;
    } return true;
}, { message: "Percentages must add up to 100%.", path: ["percentage_splits"] })
.refine(data => { /* Fixed split validation */
    if (data.split_method === SplitMethod.Fixed) {
        const totalAmount = data.amount ?? 0;
        if (totalAmount <= 0) return true;
        if (!data.custom_splits) return false;
        const values = Object.values(data.custom_splits).filter((v): v is number => typeof v === 'number' && v > 0);
        if (values.length === 0) return false; // Require at least one positive amount
        const totalCustomAmount = values.reduce((sum, v) => sum + v, 0);
        return Math.abs(totalCustomAmount - totalAmount) < 0.01;
    } return true;
}, (data) => ({ message: `Fixed amounts must add up to ${formatCurrency(data.amount)}.`, path: ["custom_splits"] }));

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

interface EditExpenseDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    expense: Expense | null;
}

const getFilenameFromPath = (path: string | null | undefined): string | null => { /* ... remains same ... */
  if (!path) return null; try { const lastSlashIndex = path.lastIndexOf('/'); if (lastSlashIndex === -1) return path; const filenameWithPotentialPrefix = path.substring(lastSlashIndex + 1); const uuidAndStorageRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-|^[a-zA-Z0-9-_]+[/]/i; let filename = filenameWithPotentialPrefix.replace(uuidAndStorageRegex, ''); const queryParamIndex = filename.indexOf('?'); if (queryParamIndex !== -1) { filename = filename.substring(0, queryParamIndex); } return decodeURIComponent(filename); } catch (e) { return path; }
};

const EditExpenseDialog: React.FC<EditExpenseDialogProps> = ({ isOpen, onOpenChange, expense }) => {
    const { user } = useAuth();
    const { selectedProperty, propertyMembers } = useProperty();
    const { updateExpenseWithSplits } = useExpenses();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isInitialMount = useRef(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [currentReceiptDisplay, setCurrentReceiptDisplay] = useState<string | null>(null);
    const [isRemovingReceipt, setIsRemovingReceipt] = useState(false);

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

    const { register, handleSubmit, control, reset, formState, setValue, trigger, getValues } = useForm<ExpenseFormData>({
        resolver: zodResolver(expenseFormSchema),
        mode: 'onChange',
        defaultValues: {
            description: "", amount: null, date: new Date(), category: undefined, paid_by_user_id: undefined,
            split_method: SplitMethod.Equal,
            notes: "", percentage_splits: {}, custom_splits: {},
            receipt_file: null, remove_receipt: false, existing_receipt_url: null,
        }
    });
    const { errors, isValid, isDirty } = formState; // Destructure after form setup

    const selectedSplitMethod = useWatch({ control, name: 'split_method' });
    const totalAmount = useWatch({ control, name: 'amount' });

    // Effect to Populate Form
    useEffect(() => {
        if (isOpen && expense && uniqueSortedMemberProfiles) {
            console.log("Populating edit form for expense:", expense.id);
            isInitialMount.current = true; setIsSubmitting(false); setIsRemovingReceipt(false); setSelectedFileName(null);

            let initialDate = new Date();
            if (expense.date) { try { const parsed = parseISO(expense.date); if (isValidDate(parsed)) initialDate = parsed; } catch (e) {} }

            let initialPercentageSplits: Record<string, number | null> = {};
            let initialCustomSplits: Record<string, number | null> = {};
            uniqueSortedMemberProfiles.forEach(member => { if(member.user_id){ initialPercentageSplits[member.user_id] = null; initialCustomSplits[member.user_id] = null; } });

            if (expense.split_method === SplitMethod.Percentage && expense.splits) {
                expense.splits.forEach(split => { /* ... populating percentage ... */
                    if(split.user_id && initialPercentageSplits.hasOwnProperty(split.user_id)){ const percentageValue = typeof split.percentage === 'string' ? parseFloat(split.percentage) : split.percentage; const percentage = !isNaN(percentageValue ?? NaN) ? percentageValue : 0; initialPercentageSplits[split.user_id] = percentage > 0 ? percentage : null; }
                });
            } else if (expense.split_method === SplitMethod.Fixed && expense.splits) {
                expense.splits.forEach(split => { /* ... populating fixed ... */
                     if(split.user_id && initialCustomSplits.hasOwnProperty(split.user_id)){ const amountValue = typeof split.amount === 'string' ? parseFloat(split.amount) : split.amount; const customAmount = !isNaN(amountValue ?? NaN) ? amountValue : 0; initialCustomSplits[split.user_id] = customAmount > 0 ? customAmount : null; }
                });
            }

            // *** FIX: Ensure required fields have valid initial values ***
            const validCategory = Object.values(ExpenseCategory).includes(expense.category as ExpenseCategory)
                ? expense.category as ExpenseCategory
                : undefined; // Keep as undefined initially, user must select if missing

            // Ensure paid_by has a value, default to current user if missing (common case)
            const initialPaidBy = expense.paid_by || user?.id || undefined;

            const validSplitMethod = Object.values(SplitMethod).includes(expense.split_method as SplitMethod)
                ? expense.split_method as SplitMethod
                : SplitMethod.Equal;

            reset({
                description: expense.description || "", amount: expense.amount ?? null, date: initialDate,
                category: validCategory,
                paid_by_user_id: initialPaidBy, // Use potentially defaulted value
                split_method: validSplitMethod,
                notes: expense.notes || "",
                percentage_splits: initialPercentageSplits, custom_splits: initialCustomSplits,
                receipt_file: null, remove_receipt: false, existing_receipt_url: expense.receipt_url,
            }, { keepDirty: false, keepErrors: false, keepValues: false });

            setCurrentReceiptDisplay(getFilenameFromPath(expense.receipt_url));
            if (fileInputRef.current) { fileInputRef.current.value = ""; }

            // Trigger validation after resetting to update isValid state based on loaded data
             setTimeout(() => trigger(), 0); // Trigger validation slightly after reset

        } else if (isOpen && !expense) {
             console.warn("EditExpenseDialog opened without valid expense.");
             reset({ /* defaults */ });
        }
    }, [isOpen, expense, reset, uniqueSortedMemberProfiles, user?.id, trigger]); // Added user.id and trigger

    const stableMemberIds = useMemo(() => { /* ... remains same ... */
        return uniqueSortedMemberProfiles.map(m => m.user_id).filter(id => !!id).sort().join(',');
    }, [uniqueSortedMemberProfiles]);

    // Effect to Handle Clearing Splits on Method Change
     useEffect(() => { /* ... remains same ... */
        if (isInitialMount.current) { isInitialMount.current = false; return; }
        if (uniqueSortedMemberProfiles.length === 0) return;
        console.log(`Edit Dialog: Split method changed to: ${selectedSplitMethod}. Clearing.`);
        const initialSplits: Record<string, null> = {};
        uniqueSortedMemberProfiles.forEach(member => { if(member.user_id) initialSplits[member.user_id] = null; });
        if (selectedSplitMethod === SplitMethod.Percentage) { setValue('custom_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
        else if (selectedSplitMethod === SplitMethod.Fixed) { setValue('percentage_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
        else { setValue('percentage_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); setValue('custom_splits', initialSplits, { shouldValidate: false, shouldDirty: true }); }
    }, [selectedSplitMethod, setValue, stableMemberIds, uniqueSortedMemberProfiles]);


    // onSubmit Handler
    const onSubmit = async (data: ExpenseFormData) => { /* ... remains same as v3 ... */
        console.log("Form Data Submitted (Edit):", data); const currentAmount = Number(data.amount) || 0; if (!selectedProperty || !user || !expense || !data.paid_by_user_id || !data.category || !data.split_method || !data.date) { toast({ title: "Validation Error", description: "Missing required info.", variant: "destructive" }); return; } if (currentAmount <= 0 && data.split_method !== SplitMethod.PayerOnly) { toast({ title: "Validation Error", description: "Amount must be positive.", variant: "destructive" }); return; } if (uniqueSortedMemberProfiles.length === 0 && [SplitMethod.Equal, SplitMethod.Percentage, SplitMethod.Fixed].includes(data.split_method)) { toast({ title: "Error", description: `Cannot split by ${data.split_method} with no members.`, variant: "destructive" }); return; } setIsSubmitting(true); const contextPayload: ExpenseFormValues = { date: data.date, description: data.description, amount: currentAmount, category: data.category as ExpenseCategoryType, paid_by_user_id: data.paid_by_user_id, split_method: data.split_method as SplitMethodType, notes: data.notes || null, receipt_url: data.existing_receipt_url, splits: [] }; try { if (data.split_method === SplitMethod.Percentage && data.percentage_splits) { contextPayload.splits = uniqueSortedMemberProfiles .filter(member => data.percentage_splits![member.user_id] != null && data.percentage_splits![member.user_id]! > 0) .map(member => { const userId = member.user_id; const percentage = data.percentage_splits![userId]!; const amount = parseFloat(((currentAmount * percentage) / 100).toFixed(2)); const status = userId === data.paid_by_user_id ? SplitStatus.Paid : SplitStatus.Owed; return { user_id: userId, amount: amount, percentage: percentage, status: status }; }); } else if (data.split_method === SplitMethod.Fixed && data.custom_splits) { contextPayload.splits = uniqueSortedMemberProfiles .filter(member => data.custom_splits![member.user_id] != null && data.custom_splits![member.user_id]! > 0) .map(member => { const userId = member.user_id; const amount = data.custom_splits![userId]!; const status = userId === data.paid_by_user_id ? SplitStatus.Paid : SplitStatus.Owed; return { user_id: userId, amount: amount, status: status }; }); } else if (data.split_method === SplitMethod.Equal) { const numberOfMembers = uniqueSortedMemberProfiles.length; if (numberOfMembers === 0) { throw new Error("Cannot equal split with zero members."); } const rawEqualAmount = currentAmount / numberOfMembers; const equalAmount = parseFloat(rawEqualAmount.toFixed(2)); const totalRoundedAmount = equalAmount * numberOfMembers; if (Math.abs(totalRoundedAmount - currentAmount) > 0.01 * numberOfMembers) { console.warn("Rounding diff equal split update"); } contextPayload.splits = uniqueSortedMemberProfiles.map(member => { const userId = member.user_id; const status = userId === data.paid_by_user_id ? SplitStatus.Paid : SplitStatus.Owed; return { user_id: userId, amount: equalAmount, status: status }; }); } else if (data.split_method === SplitMethod.PayerOnly) { contextPayload.splits = [{ user_id: data.paid_by_user_id, amount: currentAmount, status: SplitStatus.Paid }]; } if (currentAmount > 0 && contextPayload.splits.length === 0 && data.split_method !== SplitMethod.PayerOnly) { throw new Error(`Split calc empty: ${data.split_method}.`); } } catch (splitError: any) { console.error("Error calculating splits edit:", splitError); toast({ title: "Split Calc Error", description: splitError.message || "Could not prepare splits.", variant: "destructive" }); setIsSubmitting(false); return; } console.log("Calling updateExpenseWithSplits context with calculated payload:", contextPayload); try { let finalReceiptUrl: string | null | undefined = contextPayload.receipt_url; if (data.remove_receipt) { finalReceiptUrl = null; /* TODO: Delete */ console.log("Receipt marked removal."); } else if (data.receipt_file) { finalReceiptUrl = "[placeholder_new_url]"; /* TODO: Upload */ console.warn("New receipt upload needed."); } contextPayload.receipt_url = finalReceiptUrl; const { error: updateError } = await updateExpenseWithSplits(expense.id, contextPayload); if (!updateError) { toast({ title: "Success", description: `Expense updated.` }); onOpenChange(false); } else { console.error("Error from update context:", updateError); } } catch (submitError) { console.error("Error submitting update:", submitError); toast({ title: "Update Error", description: submitError instanceof Error ? submitError.message : "Unknown error.", variant: "destructive" }); } finally { if (isOpen) { setIsSubmitting(false); } }
    };

    // File Handling Logic
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => { /* ... remains same ... */
        const file = event.target.files?.[0] ?? null; setIsRemovingReceipt(false); setValue('remove_receipt', false, { shouldDirty: true }); if (file) { setValue('receipt_file', file, { shouldValidate: true, shouldDirty: true }); trigger('receipt_file').then(isValidFile => { if (isValidFile) { setSelectedFileName(file.name); setCurrentReceiptDisplay(file.name); } else { setSelectedFileName(null); handleClearNewFileSelection(); } }); } else { handleClearNewFileSelection(); }
    };
    const handleClearNewFileSelection = () => { /* ... remains same ... */
        setValue('receipt_file', null, { shouldValidate: true, shouldDirty: true }); setSelectedFileName(null); setCurrentReceiptDisplay(getFilenameFromPath(getValues('existing_receipt_url'))); setIsRemovingReceipt(false); setValue('remove_receipt', false, { shouldDirty: false }); if (fileInputRef.current) { fileInputRef.current.value = ""; }
    };
    const handleRemoveExistingFile = () => { /* ... remains same ... */
         handleClearNewFileSelection(); setIsRemovingReceipt(true); setValue('remove_receipt', true, { shouldDirty: true }); setCurrentReceiptDisplay(null);
     };


    // *** FIX: Styling Helpers - Restored full classes ***
    const getInputClassName = (hasError: boolean): string => cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", // Base classes
        hasError && "border-destructive focus-visible:ring-destructive" // Error classes
    );
    const getSelectClassName = (hasError: boolean): string => cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", // Base classes
        hasError && "border-destructive focus-visible:ring-destructive" // Error classes
    );
    const getTextareaClassName = (hasError: boolean): string => cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none", // Base classes
        hasError && "border-destructive focus-visible:ring-destructive" // Error classes
    );

    // Console logs for debugging (can be removed later)
    console.log("EditExpenseDialog formState:", { isDirty, isValid, errors });

    // Render Logic
    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (isSubmitting && !open) return; if (!open) { setIsSubmitting(false); } onOpenChange(open); }}>
             <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader> <DialogTitle>Edit Expense</DialogTitle> <DialogDescription> Modify details for "{expense?.description || 'expense'}". </DialogDescription> </DialogHeader>
                {!expense ? ( <div className="flex items-center justify-center py-10"> <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading... </div> )
                 : (
                    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-4">
                        {/* Description */}
                         <div className="space-y-2"> <Label htmlFor="edit-description" className={cn(errors.description && "text-destructive")}>Description *</Label> <Input id="edit-description" {...register("description")} className={getInputClassName(!!errors.description)} aria-invalid={!!errors.description} /> {errors.description && <p className="text-sm font-medium text-destructive">{errors.description.message}</p>} </div>
                        {/* Amount */}
                         <div className="space-y-2"> <Label htmlFor="edit-amount" className={cn(errors.amount && "text-destructive")}>Amount *</Label> <Controller name="amount" control={control} render={({ field: { onChange, ...rest } }) => ( <Input id="edit-amount" type="number" step="0.01" placeholder="0.00" onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))} {...rest} value={rest.value ?? ''} className={getInputClassName(!!errors.amount)} aria-invalid={!!errors.amount} /> )} /> {errors.amount && <p className="text-sm font-medium text-destructive">{errors.amount.message}</p>} </div>
                        {/* Date */}
                         <div className="space-y-2"> <Label htmlFor="edit-date" className={cn(errors.date && "text-destructive")}>Date *</Label> <Controller name="date" control={control} render={({ field }) => ( <input id="edit-date" type="date" onChange={(e) => field.onChange(e.target.valueAsDate)} onBlur={field.onBlur} value={field.value instanceof Date && isValidDate(field.value) ? format(field.value, 'yyyy-MM-dd') : ''} ref={field.ref} name={field.name} className={getInputClassName(!!errors.date)} aria-invalid={!!errors.date} /> )} /> {errors.date && <p className="text-sm font-medium text-destructive">{typeof errors.date?.message === 'string' ? errors.date.message : 'Invalid Date'}</p>} </div>
                        {/* Category */}
                         <div className="space-y-2"> <Label htmlFor="edit-category" className={cn(errors.category && "text-destructive")}>Category *</Label> <select id="edit-category" {...register("category")} className={getSelectClassName(!!errors.category)} aria-invalid={!!errors.category}> <option value="" disabled>Select category</option> {Object.values(ExpenseCategory).map((cat) => ( <option key={String(cat)} value={String(cat)}>{formatCategoryName(cat)}</option> ))} </select> {errors.category && <p className="text-sm font-medium text-destructive">{errors.category.message}</p>} </div>
                        {/* Paid By */}
                         <div className="space-y-2">
                            <Label htmlFor="edit-paid_by_user_id" className={cn(errors.paid_by_user_id && "text-destructive")}>Paid By *</Label>
                            <select id="edit-paid_by_user_id" {...register("paid_by_user_id")} className={getSelectClassName(!!errors.paid_by_user_id)} disabled={uniqueSortedMemberProfiles.length === 0} aria-invalid={!!errors.paid_by_user_id}>
                                <option value="" disabled>Select who paid</option>
                                {uniqueSortedMemberProfiles.map((member) => ( <option key={member.user_id} value={member.user_id}>{member.profile?.first_name} {member.profile?.last_name} {member.user_id === user?.id ? '(You)' : ''}</option> ))}
                             </select>
                             {errors.paid_by_user_id && <p className="text-sm font-medium text-destructive">{errors.paid_by_user_id.message}</p>}
                         </div>
                        {/* Split Method */}
                        <div className="space-y-2"> <Label className={cn(errors.split_method && "text-destructive")}>Split Method *</Label> <Controller name="split_method" control={control} render={({ field }) => ( <RadioGroup onValueChange={field.onChange} value={field.value} className={cn("flex flex-col space-y-1", errors.split_method && "rounded-md border border-destructive p-2")}> {Object.values(SplitMethod).map((val) => ( <div key={String(val)} className="flex items-center space-x-3 space-y-0"> <RadioGroupItem value={String(val)} id={`edit-split-${String(val)}-${field.name}`} /> <Label htmlFor={`edit-split-${String(val)}-${field.name}`} className="font-normal capitalize cursor-pointer">{String(val).replace(/_/g, ' ')}</Label> </div> ))} </RadioGroup> )} /> {errors.split_method && <p className="text-sm font-medium text-destructive">{errors.split_method.message}</p>} </div>
                        {/* Conditional Splits - Use unique list */}
                        {selectedSplitMethod === SplitMethod.Percentage && (
                             <div className="space-y-3 rounded-md border border-border p-4"> {/* ... Percentage Split Fields using uniqueSortedMemberProfiles ... */}
                                <Label className="font-medium">Split by Percentage</Label> {errors.percentage_splits && typeof errors.percentage_splits.message === 'string' && ( <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs">{errors.percentage_splits.message}</AlertDescription></Alert> )}
                                <div className="space-y-2"> {uniqueSortedMemberProfiles.map((member) => ( <div key={`perc-${member.user_id}`} className="flex items-center gap-3"> <Avatar className="h-6 w-6"><AvatarImage src={member.profile?.avatar_url ?? undefined} /> <AvatarFallback>{getInitials(`${member.profile?.first_name ?? ''} ${member.profile?.last_name ?? ''}`)}</AvatarFallback></Avatar> <Label htmlFor={`edit-percentage-${member.user_id}`} className="flex-1 text-sm">{member.profile?.first_name ?? ''} {member.profile?.last_name ?? ''} {member.user_id === user?.id ? '(You)' : ''}</Label> <div className="relative w-24"> <Controller name={`percentage_splits.${member.user_id}`} control={control} render={({ field: { onChange, ...rest }, fieldState }) => ( <Input id={`edit-percentage-${member.user_id}`} type="number" step="0.01" min="0" max="100" placeholder="0" onChange={(e) => { onChange(e.target.value === '' ? null : parseFloat(e.target.value)); trigger("percentage_splits"); }} {...rest} value={rest.value ?? ''} className={cn(getInputClassName(!!fieldState.error), "pr-7")} aria-invalid={!!fieldState.error} /> )} /> <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" /> </div> </div> ))} </div>
                            </div>
                        )}
                        {selectedSplitMethod === SplitMethod.Fixed && (
                            <div className="space-y-3 rounded-md border border-border p-4"> {/* ... Fixed Split Fields using uniqueSortedMemberProfiles ... */}
                                <Label className="font-medium">Split by Fixed Amount</Label> {errors.custom_splits && typeof errors.custom_splits.message === 'string' && ( <Alert variant="destructive" className="mt-2"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs">{errors.custom_splits.message}</AlertDescription></Alert> )} {(!totalAmount || totalAmount <= 0) && ( <Alert variant="default" className="mt-2 border-yellow-500 text-yellow-700 [&>svg]:text-yellow-700"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs">Enter positive amount.</AlertDescription></Alert> )}
                                <div className="space-y-2"> {uniqueSortedMemberProfiles.map((member) => ( <div key={`cust-${member.user_id}`} className="flex items-center gap-3"> <Avatar className="h-6 w-6"><AvatarImage src={member.profile?.avatar_url ?? undefined} /> <AvatarFallback>{getInitials(`${member.profile?.first_name ?? ''} ${member.profile?.last_name ?? ''}`)}</AvatarFallback></Avatar> <Label htmlFor={`edit-custom-${member.user_id}`} className="flex-1 text-sm">{member.profile?.first_name ?? ''} {member.profile?.last_name ?? ''} {member.user_id === user?.id ? '(You)' : ''}</Label> <Controller name={`custom_splits.${member.user_id}`} control={control} render={({ field: { onChange, ...rest }, fieldState }) => ( <Input id={`edit-custom-${member.user_id}`} type="number" step="0.01" min="0" placeholder="0.00" onChange={(e) => { onChange(e.target.value === '' ? null : parseFloat(e.target.value)); trigger("custom_splits"); }} {...rest} value={rest.value ?? ''} className={cn(getInputClassName(!!fieldState.error), "w-24")} disabled={!totalAmount || totalAmount <= 0} aria-invalid={!!fieldState.error} /> )} /> </div> ))} </div>
                            </div>
                        )}
                        {/* Notes */}
                         <div className="space-y-2"> <Label htmlFor="edit-notes" className={cn(errors.notes && "text-destructive")}>Notes (Optional)</Label> <Textarea id="edit-notes" {...register("notes")} className={getTextareaClassName(!!errors.notes)} aria-invalid={!!errors.notes} /> {errors.notes && <p className="text-sm font-medium text-destructive">{errors.notes.message}</p>} </div>
                        {/* Receipt */}
                         <div className="space-y-2"> {/* ... Receipt Field ... */}
                            <Label htmlFor="receipt_file_input_edit" className={cn("cursor-pointer", errors.receipt_file && "text-destructive")}> Receipt </Label>
                            <div className={cn( "flex items-center space-x-2 rounded-md border border-input pr-1", errors.receipt_file ? "border-destructive ring-destructive ring-1" : "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2" )}>
                                <Label htmlFor="receipt_file_input_edit" className={cn( "inline-flex items-center justify-center whitespace-nowrap rounded-l-md text-sm font-medium h-10 px-3 py-2 cursor-pointer bg-transparent hover:bg-accent hover:text-accent-foreground border-r border-input ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" )}> <Paperclip className="mr-2 h-4 w-4" aria-hidden="true" /> {getValues('existing_receipt_url') || selectedFileName ? 'Change' : 'Attach File'} </Label>
                                <input type="file" id="receipt_file_input_edit" ref={fileInputRef} onChange={handleFileChange} accept={ACCEPTED_FILE_EXTENSIONS} className="sr-only" aria-invalid={!!errors.receipt_file} aria-describedby={errors.receipt_file ? "receipt-error-message-edit" : undefined} />
                                <span className="flex-1 text-sm text-muted-foreground truncate px-2 py-2 h-10 flex items-center"> {errors.receipt_file ? <span className='text-destructive'>{errors.receipt_file.message}</span> : isRemovingReceipt ? <span className='text-destructive font-medium'>[Marked for removal]</span> : currentReceiptDisplay ? currentReceiptDisplay : `Max ${MAX_FILE_SIZE_MB}MB ...`} </span>
                                {getValues('receipt_file') && !isRemovingReceipt && ( <Button type="button" variant="ghost" size="icon" onClick={handleClearNewFileSelection} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0" aria-label="Clear new file"> <XCircle className="h-4 w-4" /> </Button> )}
                                {!getValues('receipt_file') && getValues('existing_receipt_url') && !isRemovingReceipt && ( <Button type="button" variant="ghost" size="icon" onClick={handleRemoveExistingFile} className="h-8 w-8 text-destructive hover:bg-destructive/10 flex-shrink-0" aria-label="Remove existing file"> <Trash2 className="h-4 w-4" /> </Button> )}
                            </div>
                         </div>

                        {/* Footer */}
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}> Cancel </Button>
                            {/* Button Disabled Logic: Check !isValid and !isDirty */}
                            <Button type="submit" disabled={isSubmitting || !isValid || !isDirty}> {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : ("Save Changes")} </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default EditExpenseDialog;