// src/components/expenses/ExpenseDetailSheet.tsx
// v4 - Restored receipt viewing functionality by calling getReceiptUrl from context.
// This version should be used with ExpenseContext v26+ which provides getReceiptUrl.

import React, { useState, useMemo } from 'react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose, SheetFooter
} from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from '@/components/ui/separator';
import {
    Expense,
    Profile,
    ExpenseSplitWithProfile,
    SplitStatus,
    SplitMethodType,
    PropertyMemberWithProfile
} from '@/integrations/supabase/types';
import { formatCurrency, formatDate, formatSplitMethod, getInitials, formatCategoryName, cn } from '@/lib/utils';
import { useProperty } from '@/contexts/PropertyContext';
// --- Ensure useExpenses is imported ---
import { useExpenses } from '@/contexts/ExpenseContext';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, CheckCircle, FileText, Loader2, Hourglass } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExpenseDetailSheetProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    expense: Expense | null;
}

// Helper to render split details (No changes needed here)
const RenderSplitDetails = ({ splits, memberProfiles }: { splits: ExpenseSplitWithProfile[], memberProfiles: PropertyMemberWithProfile[] }) => {
    const profileMap = useMemo(() => new Map(memberProfiles.map(m => [m.user_id, m.profile])), [memberProfiles]);
    if (!Array.isArray(splits) || splits.length === 0) { return <p className="text-muted-foreground italic text-sm">No split details available.</p>; }
    return ( <ul className="space-y-2 text-sm"> {splits.map((split) => { const profile = split.user_profile ?? profileMap.get(split.user_id); const profileName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : `Unknown User (${split.user_id.substring(0, 6)}...)`; const isPaid = split.status === SplitStatus.Paid; const initials = getInitials(profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : profileName); return ( <li key={split.id} className="flex items-center justify-between gap-2"> <div className="flex items-center space-x-2"> <Avatar className="h-5 w-5"> <AvatarImage src={profile?.avatar_url ?? undefined} alt={profileName} /> <AvatarFallback className="text-xs">{initials}</AvatarFallback> </Avatar> <span className="truncate" title={profileName}>{profileName}</span> </div> <div className="flex items-center gap-1.5 flex-shrink-0"> <span className={cn('font-medium', isPaid ? 'text-muted-foreground line-through' : '')}>{formatCurrency(split.amount)}</span> {isPaid ? ( <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger> <CheckCircle className="h-4 w-4 text-green-600" /> </TooltipTrigger><TooltipContent><p>Paid</p></TooltipContent></Tooltip></TooltipProvider> ) : ( <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger> <Hourglass className="h-4 w-4 text-orange-600" /> </TooltipTrigger><TooltipContent><p>Owed</p></TooltipContent></Tooltip></TooltipProvider> )} </div> </li> ); })} </ul> );
};

// Helper to render a detail item (No changes needed here)
const DetailItem = ({ label, value }: { label: string; value: React.ReactNode }) => ( <div className="grid grid-cols-3 gap-2 py-2 items-start"> <dt className="font-medium text-muted-foreground text-sm break-words">{label}</dt> <dd className="col-span-2 text-sm break-words">{value ?? <span className="italic text-muted-foreground">N/A</span>}</dd> </div> );

export function ExpenseDetailSheet({ isOpen, onOpenChange, expense }: ExpenseDetailSheetProps) {
    const { propertyMembers } = useProperty();
    // --- Get getReceiptUrl from the context ---
    const { getReceiptUrl } = useExpenses();
    const { toast } = useToast(); // Keep toast for potential errors within the component
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    const typedMemberProfiles = useMemo(() =>
        Array.isArray(propertyMembers) ? propertyMembers as PropertyMemberWithProfile[] : [],
        [propertyMembers]
    );

    // --- handleViewReceipt logic calls getReceiptUrl ---
    const handleViewReceipt = async () => {
         // Guard clauses: Check if expense, receipt_url, and the function exist
         if (!expense?.receipt_url) {
            toast({ title: "Info", description: "No receipt attached to this expense.", variant: "default"});
            return;
         }
         if (!getReceiptUrl) {
             console.error("handleViewReceipt: getReceiptUrl function is not available in ExpenseContext.");
             toast({ title: "Error", description: "Receipt viewing function is unavailable.", variant: "destructive"});
             return;
         }

         setLoadingReceipt(true); // Start loading indicator
         try {
             // Call the context function
             const url = await getReceiptUrl(expense.receipt_url);
             if (url) {
                 window.open(url, '_blank', 'noopener,noreferrer'); // Open URL in new tab
             } else {
                // Error toast should be handled within getReceiptUrl if the URL is null/error occurs there
                // If getReceiptUrl returns null without throwing an error, we might need a toast here.
                console.warn("handleViewReceipt: getReceiptUrl returned null.");
                // Optional: Add a toast here if needed, but the context function should ideally handle errors.
                // toast({ title: "Error", description: "Could not retrieve receipt URL.", variant: "destructive" });
             }
         } catch (error) {
             // Catch any unexpected errors during the process (e.g., if window.open fails)
             console.error("Error in handleViewReceipt:", error);
             toast({ title: "Error", description: `Failed to open receipt: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" });
         } finally {
             setLoadingReceipt(false); // Stop loading indicator regardless of outcome
         }
    };
    // --- End handleViewReceipt logic ---

    if (!expense) return null;

    const payerProfile = typedMemberProfiles.find(m => m.user_id === expense.paid_by)?.profile;
    const payerName = payerProfile ? `${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`.trim() : 'Unknown Payer';
    const payerInitials = getInitials(payerName);
    const categoryFormatted = formatCategoryName(expense.category);
    const splitMethodFormatted = formatSplitMethod(expense.split_method as SplitMethodType);

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg w-[90vw] flex flex-col">
                <SheetHeader className="pr-6">
                     <SheetTitle className="truncate">{expense.description || 'Expense Details'}</SheetTitle>
                     <SheetDescription> Read-only view of the expense record. </SheetDescription>
                 </SheetHeader>
                <Separator className="my-3" />
                <ScrollArea className="flex-grow pr-6 -mr-6">
                    <dl className="space-y-1">
                        {/* Core Details */}
                        <DetailItem label="Description" value={expense.description} />
                        <DetailItem label="Date" value={formatDate(expense.date)} />
                        <DetailItem label="Amount" value={formatCurrency(expense.amount)} />
                        <DetailItem label="Category" value={categoryFormatted} />
                        <DetailItem label="Payer" value={ payerProfile ? ( <div className="flex items-center space-x-2"> <Avatar className="h-5 w-5"> <AvatarImage src={payerProfile.avatar_url ?? undefined} alt={payerName} /> <AvatarFallback className="text-xs">{payerInitials}</AvatarFallback> </Avatar> <span>{payerName}</span> </div> ) : ( 'Unknown Payer' ) } />
                        <Separator className="my-2" />

                         {/* --- Receipt Section Updated --- */}
                         <DetailItem
                            label="Receipt"
                            value={
                                expense.receipt_url ? (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                {/* Button now calls restored handleViewReceipt */}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleViewReceipt}
                                                    disabled={!expense.receipt_url || loadingReceipt} // Disable if no URL or loading
                                                    className="h-8"
                                                >
                                                    {loadingReceipt ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <FileText className="mr-2 h-4 w-4" />
                                                    )}
                                                     View Receipt
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>Open receipt file in a new tab</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ) : (
                                    <span className="italic text-muted-foreground">No receipt attached</span>
                                )
                            }
                        />
                        {/* --- End Receipt Section Update --- */}

                        <Separator className="my-2" />
                        {/* Split Details */}
                        <DetailItem label="Split Method" value={splitMethodFormatted} />
                        <div className="py-2">
                            <dt className="font-medium text-muted-foreground text-sm mb-2">Split Breakdown</dt>
                            <dd className="col-span-2 text-sm">
                                <RenderSplitDetails splits={expense.splits} memberProfiles={typedMemberProfiles} />
                            </dd>
                        </div>
                        <Separator className="my-2" />
                        {/* Notes & Metadata */}
                        <DetailItem label="Notes" value={expense.notes || <span className="italic text-muted-foreground">No notes</span>} />
                        <Separator className="my-2" />
                        <DetailItem label="Created" value={formatDate(expense.created_at)} />
                        <DetailItem label="Last Updated" value={expense.updated_at ? formatDate(expense.updated_at) : 'Never'} />
                    </dl>
                </ScrollArea>
                <Separator className="my-3" />
                <SheetFooter className="mt-auto">
                    <SheetClose asChild>
                         <Button variant="outline">Close</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

// Assuming default export is correct based on previous steps
export default ExpenseDetailSheet;