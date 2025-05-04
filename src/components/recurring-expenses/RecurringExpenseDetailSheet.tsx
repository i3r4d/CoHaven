// src/components/recurring-expenses/RecurringExpenseDetailSheet.tsx
// Corrected: Removed 'Constants' import and replaced its usage with SplitMethod enum.
import React from 'react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose, SheetFooter
} from "@/components/ui/sheet";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from '@/components/ui/separator';
// Corrected Import Line: Removed Constants
import { RecurringExpense, Profile, SplitMethod, Json, PropertyMemberWithProfile } from '@/integrations/supabase/types';
// *** UPDATED utils import ***
import { formatCurrency, formatFrequencyDetailed, formatDate, formatSplitMethod, getInitials, getTemplateStatus } from '@/lib/utils'; // Importing needed utils
import { useProperty } from '@/contexts/PropertyContext';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface RecurringExpenseDetailSheetProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    expense: RecurringExpense | null;
}

// Helper to display split details nicely
const renderSplitDetails = (expense: RecurringExpense, memberProfiles: PropertyMemberWithProfile[]): React.ReactNode => { // Use PropertyMemberWithProfile which includes Profile
    // Ensure profiles are available
    const profileMap = new Map(memberProfiles.filter(mp => mp.profile).map(mp => [mp.user_id, mp.profile!])); // Filter out null profiles and assert non-null

    const getProfileName = (id: string) => {
        const profile = profileMap.get(id);
        // Use ?? for cleaner fallback logic
        return profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : `Unknown User (${id.substring(0, 6)}...)`;
    };

    const method = expense.split_method;
    // Assume structure based on how it's created, but validate access
    // Cast to a more specific type if possible, otherwise keep as Json and check structure
    const details = expense.split_details as { type?: string; splits?: Record<string, number | null> } | null; // Added potential 'null' for splits values

    // Corrected: Use SplitMethod enum
    switch (method) {
        case SplitMethod.Equal:
            return <p>Split equally among all members.</p>;
        // case SplitMethod.PayerOnly: // Assuming 'PayerOnly' exists in your enum
        //     return <p>Paid entirely by the designated payer.</p>;
        case SplitMethod.Percentage:
             if (details?.splits && typeof details.splits === 'object') {
                return (
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        {Object.entries(details.splits).map(([userId, percentage]) => (
                            <li key={userId}>
                                {getProfileName(userId)}: {typeof percentage === 'number' ? `${percentage.toFixed(2)}%` : 'Invalid data'}
                            </li>
                        ))}
                    </ul>
                );
            }
            return <p className="text-muted-foreground italic">Percentage details unavailable.</p>;
        case SplitMethod.Custom: // Assuming 'Custom' exists in your enum
             if (details?.splits && typeof details.splits === 'object') {
                return (
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        {Object.entries(details.splits).map(([userId, amount]) => (
                             <li key={userId}>
                                {getProfileName(userId)}: {typeof amount === 'number' ? formatCurrency(amount) : 'Invalid data'}
                            </li>
                        ))}
                    </ul>
                );
            }
            return <p className="text-muted-foreground italic">Custom split details unavailable.</p>;
        // case SplitMethod.Shares: // Handle Shares if it exists in your enum
        //     // Similar logic to Percentage/Custom, accessing share values
        //     return <p className="text-muted-foreground italic">Shares details unavailable.</p>;
        default:
            // Use exhaustive check if possible with TypeScript, otherwise fallback
             console.warn("Unhandled split method in renderSplitDetails:", method);
            return <p className="text-muted-foreground italic">Split details not applicable or unavailable.</p>;
    }
};

// Helper to render a detail item
const DetailItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-2 py-2 items-start">
        <dt className="font-medium text-muted-foreground text-sm break-words">{label}</dt>
        <dd className="col-span-2 text-sm break-words">{value ?? <span className="italic text-muted-foreground">N/A</span>}</dd>
    </div>
);

export function RecurringExpenseDetailSheet({ isOpen, onOpenChange, expense }: RecurringExpenseDetailSheetProps) {
    // Use propertyMembers which includes profile data
    const { propertyMembers = [] } = useProperty();

    if (!expense) return null;

    const status = getTemplateStatus(expense);
    const payerProfileData = propertyMembers.find(p => p.user_id === expense.paid_by_user_id)?.profile; // Extract profile

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg w-[90vw] flex flex-col">
                <SheetHeader className="pr-6">
                    <SheetTitle className="truncate">{expense.description || 'Expense Template Details'}</SheetTitle>
                    <SheetDescription>
                        Read-only view of the recurring expense template.
                    </SheetDescription>
                </SheetHeader>
                <Separator className="my-3" />
                <ScrollArea className="flex-grow pr-6 -mr-6"> {/* Adjust padding if needed */}
                    <dl className="space-y-1">
                        <DetailItem label="Description" value={expense.description} />
                        <DetailItem label="Amount" value={formatCurrency(expense.amount)} />
                         {/* Use formatEnumForDisplay or similar if defined */}
                        <DetailItem label="Category" value={expense.category?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} />
                        <DetailItem
                            label="Payer"
                            value={
                                payerProfileData ? (
                                    <div className="flex items-center space-x-2">
                                        <Avatar className="h-5 w-5">
                                            <AvatarImage src={payerProfileData.avatar_url ?? undefined} alt={`${payerProfileData.first_name ?? ''} ${payerProfileData.last_name ?? ''}`} />
                                            <AvatarFallback className="text-xs">{getInitials(`${payerProfileData.first_name ?? ''} ${payerProfileData.last_name ?? ''}`)}</AvatarFallback>
                                        </Avatar>
                                        <span>{`${payerProfileData.first_name ?? ''} ${payerProfileData.last_name ?? ''}`}</span>
                                    </div>
                                ) : (
                                    'Unknown Payer'
                                )
                            }
                        />
                        <Separator className="my-2" />
                        {/* Use formatFrequencyDetailed which handles interval */}
                        <DetailItem label="Frequency" value={formatFrequencyDetailed(expense.frequency, expense.interval)} />
                        <DetailItem label="Starts On" value={formatDate(expense.start_date)} />
                        <DetailItem label="Next Due" value={formatDate(expense.next_due_date)} />
                        <DetailItem label="Ends On" value={expense.end_date ? formatDate(expense.end_date) : 'Never'} />
                        <DetailItem
                            label="Status"
                            value={
                                <Badge variant={status === 'ended' ? "outline" : (expense.is_active ? "default" : "secondary")}>
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                </Badge>
                            }
                        />
                         <Separator className="my-2" />
                        <DetailItem label="Split Method" value={formatSplitMethod(expense.split_method)} />
                        {/* Pass propertyMembers to renderSplitDetails */}
                        <DetailItem label="Split Details" value={renderSplitDetails(expense, propertyMembers)} />
                         <Separator className="my-2" />
                         <DetailItem label="Notes" value={expense.notes || <span className="italic text-muted-foreground">No notes</span>} />
                         <Separator className="my-2" />
                        <DetailItem label="Created" value={formatDate(expense.created_at)} />
                        <DetailItem label="Last Updated" value={expense.updated_at ? formatDate(expense.updated_at) : 'Never'} />

                    </dl>
                </ScrollArea>
                <Separator className="my-3" />
                <SheetFooter className="mt-auto pr-6"> {/* Ensure footer aligns with content */}
                    <SheetClose asChild>
                        <Button variant="outline">Close</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}