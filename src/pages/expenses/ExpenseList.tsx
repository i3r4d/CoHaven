// src/pages/expenses/ExpenseList.tsx
// v13 - FIX: Attempt 3 - Wrap DropdownMenuItem content in div with onClick and stopPropagation.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Search, AlertTriangle, MoreHorizontal, X, Edit, Trash2, Loader2, CheckCircle, FileText } from 'lucide-react';
import { useExpenses } from '@/contexts/ExpenseContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO, isValid as isDateValid } from 'date-fns';
import { cn, getInitials, formatCategoryName, formatCurrency, formatSplitMethod as formatSplitMethodUtil } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import EditExpenseDialog from '@/components/expenses/EditExpenseDialog';
import { ExpenseDetailSheet } from '@/components/expenses/ExpenseDetailSheet';
import {
    Expense,
    Profile,
    SplitStatus,
    ExpenseCategory,
    ExpenseSplitWithProfile,
    SplitMethod,
    SplitMethodType,
    PropertyMemberWithProfile,
    ExpenseCategoryType
} from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

// Custom Hook for Debounce
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => { const handler = setTimeout(() => { setDebouncedValue(value); }, delay); return () => { clearTimeout(handler); }; }, [value, delay]);
    return debouncedValue;
};

// Component Definition
const ExpenseList = () => {
    const { user } = useAuth();
    const {
        expenses: rawExpenses,
        isLoadingExpenses: isLoading,
        errorExpenses: error,
        deleteExpenseWithSplits,
    } = useExpenses();
    const { selectedProperty, propertyMembers } = useProperty();
    const { toast } = useToast();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [settlingSplitId, setSettlingSplitId] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
    const [payerFilter, setPayerFilter] = useState<string | 'all'>('all');
    const [searchTermInput, setSearchTermInput] = useState('');
    const debouncedSearchTerm = useDebounce(searchTermInput, 300);
    const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
    const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
    const [expenseForDetail, setExpenseForDetail] = useState<Expense | null>(null);

    const typedMemberProfiles = useMemo(() =>
        Array.isArray(propertyMembers) ? propertyMembers as PropertyMemberWithProfile[] : [],
        [propertyMembers]
    );

    const uniqueMemberProfilesForFilter = useMemo(() => {
        const seenUserIds = new Set<string>();
        const uniqueMembers: PropertyMemberWithProfile[] = [];
        typedMemberProfiles.forEach(member => {
            if (member?.user_id && !seenUserIds.has(member.user_id)) {
                seenUserIds.add(member.user_id);
                uniqueMembers.push(member);
            }
        });
        uniqueMembers.sort((a, b) => {
            const nameA = `${a.profile?.first_name ?? ''} ${a.profile?.last_name ?? ''}`.trim().toLowerCase();
            const nameB = `${b.profile?.first_name ?? ''} ${b.profile?.last_name ?? ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB); });
        return uniqueMembers;
    }, [typedMemberProfiles]);


    const getPayerProfile = useCallback((payerId: string | null | undefined): Profile | null => {
        if (!payerId || !Array.isArray(typedMemberProfiles)) return null;
        const member = typedMemberProfiles.find((m) => m.user_id === payerId);
        return member?.profile || null;
    }, [typedMemberProfiles]);

    const renderPayer = useCallback((payerId: string | null | undefined) => {
        const payerProfile = getPayerProfile(payerId);
        if (!payerProfile) return <span className="text-muted-foreground">Unknown</span>;
        const initials = getInitials(`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`);
        return ( <div className="flex items-center gap-2"> <Avatar className="h-6 w-6"> <AvatarImage src={payerProfile.avatar_url ?? undefined} alt={`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`} /> <AvatarFallback>{initials}</AvatarFallback> </Avatar> <span className="whitespace-nowrap">{`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`}</span> </div> );
    }, [getPayerProfile]);

    const renderMyStatus = useCallback((expense: Expense, currentUser: typeof user | null): React.ReactNode => {
        if (!currentUser || !expense || !expense.splits) return <Badge variant="secondary">N/A</Badge>;
        const mySplit = expense.splits.find(s => s.user_id === currentUser.id);
        const iPaid = expense.paid_by === currentUser.id;
        if (iPaid) {
            const othersOwe = expense.splits.some(s => s.user_id !== currentUser.id && s.status === SplitStatus.Owed);
            return othersOwe ? <Badge variant="outline" className="border-blue-500 text-blue-700">Paid/Waiting</Badge> : <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Paid/Settled</Badge>;
        } else if (mySplit) {
             const amountValue = typeof mySplit.amount === 'string' ? parseFloat(mySplit.amount) : mySplit.amount;
             const formattedAmount = !isNaN(amountValue ?? NaN) ? formatCurrency(amountValue) : '?';
            if (mySplit.status === SplitStatus.Paid) { return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Paid ({formattedAmount})</Badge>; }
            else { return <Badge variant="destructive">Owed ({formattedAmount})</Badge>; }
        } else { return <Badge variant="secondary">Not Involved</Badge>; }
    }, [user]);

    const renderSplitMethod = useCallback((method: SplitMethodType | null | undefined): React.ReactNode => {
        if (!method) return <Badge variant="secondary">N/A</Badge>;
        const formatted = formatSplitMethodUtil(method);
        let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
        if (method === 'equal') variant = "outline";
        else if (method === 'payer_only') variant = "secondary";
        else if (method === 'fixed') variant = "default";
        else if (method === 'percentage') variant = "default";
        else if (method === 'shares') variant = "default";
        return <Badge variant={variant}>{formatted}</Badge>;
    }, []);


    const filteredExpenses = useMemo(() => {
        const expensesToFilter = Array.isArray(rawExpenses) ? rawExpenses : [];
        let filtered = [...expensesToFilter];
        if (categoryFilter !== 'all') { filtered = filtered.filter(expense => expense?.category === categoryFilter); }
        if (payerFilter !== 'all') { filtered = filtered.filter(expense => expense?.paid_by === payerFilter); }
        const trimmedSearch = debouncedSearchTerm.trim().toLowerCase();
        if (trimmedSearch) { filtered = filtered.filter(expense => expense && ( expense.description?.toLowerCase().includes(trimmedSearch) || (expense.notes && expense.notes.toLowerCase().includes(trimmedSearch)) ) ); }
        filtered.sort((a, b) => { const dateA = a?.date ? parseISO(a.date).getTime() : 0; const dateB = b?.date ? parseISO(b.date).getTime() : 0; if (isNaN(dateA) && isNaN(dateB)) return 0; if (isNaN(dateA)) return 1; if (isNaN(dateB)) return -1; return dateB - dateA; });
        return filtered;
    }, [rawExpenses, categoryFilter, payerFilter, debouncedSearchTerm]);

    // Handlers
    const clearFilters = useCallback(() => { setCategoryFilter('all'); setPayerFilter('all'); setSearchTermInput(''); }, []);
    const hasActiveFilters = useMemo(() => categoryFilter !== 'all' || payerFilter !== 'all' || searchTermInput !== '', [categoryFilter, payerFilter, searchTermInput]);
    const handleEdit = useCallback((expense: Expense) => { console.log("handleEdit called for:", expense.id); setExpenseToEdit(expense); setIsEditDialogOpen(true); }, []);
    const handleDeleteRequest = useCallback((expense: Expense) => { console.log("handleDeleteRequest called for:", expense.id); setExpenseToDelete(expense); setIsDeleteDialogOpen(true); }, []);
    const handleConfirmDelete = useCallback(async () => { if (!expenseToDelete || !deleteExpenseWithSplits) return; setIsDeleting(true); const { error: deleteError } = await deleteExpenseWithSplits(expenseToDelete.id); setIsDeleting(false); if (!deleteError) { toast({ title: "Success", description: `Expense "${expenseToDelete.description}" deleted.` }); setIsDeleteDialogOpen(false); setExpenseToDelete(null); } else { toast({ title: "Error", description: `Failed to delete: ${deleteError.message}`, variant: "destructive" }); } }, [expenseToDelete, deleteExpenseWithSplits, toast]);
    const handleSettleSplit = useCallback(async (splitId: string) => { setSettlingSplitId(splitId); console.warn("Settle split disabled."); toast({ title: "Info", description: "Settling disabled.", variant: "default" }); setSettlingSplitId(null); }, [toast]);
    const handleViewReceipt = useCallback(async (expenseId: string, filePath: string | null | undefined) => { if (!filePath) { toast({ title: "Info", description: "No receipt.", variant: "default" }); return; } setLoadingReceiptId(expenseId); console.warn("View receipt disabled."); toast({ title: "Info", description: "Viewing disabled.", variant: "default" }); setLoadingReceiptId(null); }, [toast]);
    const handleViewDetails = useCallback((expense: Expense) => { console.log("handleViewDetails called for:", expense.id); setExpenseForDetail(expense); setIsDetailSheetOpen(true); }, []);


     const renderTableRows = useCallback(() => {
        const COL_SPAN = 9;
        if (isLoading) { return Array.from({ length: 5 }).map((_, index) => ( <TableRow key={`skel-${index}`}><TableCell colSpan={COL_SPAN}><Skeleton className="h-8 w-full" /></TableCell></TableRow> )); }
        if (error) { return <TableRow><TableCell colSpan={COL_SPAN} className="text-center py-10 text-destructive"><AlertTriangle className="inline-block mr-2" /> Error: {error}</TableCell></TableRow>; }
        if (!selectedProperty) { return <TableRow><TableCell colSpan={COL_SPAN} className="text-center py-10 text-muted-foreground">Select property.</TableCell></TableRow>; }
        const expensesToDisplay = filteredExpenses;
        if (!Array.isArray(expensesToDisplay)) { return <TableRow><TableCell colSpan={COL_SPAN} className="text-center py-10 text-muted-foreground">Error displaying.</TableCell></TableRow>; }
        if (expensesToDisplay.length === 0) { const emptyMessage = (rawExpenses?.length ?? 0) === 0 ? `No expenses for ${selectedProperty?.name}. Add one!` : hasActiveFilters ? "No expenses match filters." : "No expenses."; return <TableRow><TableCell colSpan={COL_SPAN} className="text-center py-10 text-muted-foreground">{emptyMessage}</TableCell></TableRow>; }

        return expensesToDisplay.map(expense => {
            if (!expense?.id || !expense.date) { return null; }
            const mySplit: ExpenseSplitWithProfile | undefined = user && Array.isArray(expense.splits) ? expense.splits.find(s => s.user_id === user.id) : undefined;
            const isCurrentlySettling = settlingSplitId === mySplit?.id;
            const isCurrentlyLoadingReceipt = loadingReceiptId === expense.id;
            const payerElement = renderPayer(expense.paid_by);
            const splitMethodElement = renderSplitMethod(expense.split_method);
            const myStatusElement = renderMyStatus(expense, user);
            const categoryFormatted = formatCategoryName(expense.category);
            let formattedDate = 'Invalid Date'; try { const parsedDate = parseISO(expense.date); if (isDateValid(parsedDate)) { formattedDate = format(parsedDate, 'MMM d, yyyy'); } } catch (e) { /* ignore */ }

            return (
                <TooltipProvider key={expense.id} delayDuration={100}>
                    {/* Row onClick triggers Detail Sheet */}
                    <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => handleViewDetails(expense)}>
                        <TableCell className="max-w-[150px] truncate font-medium" title={expense.description}>{expense.description}</TableCell>
                        <TableCell>{payerElement}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatCurrency(expense.amount)}</TableCell>
                        <TableCell>{splitMethodElement}</TableCell>
                        <TableCell className="whitespace-nowrap">{formattedDate}</TableCell>
                        <TableCell>{categoryFormatted}</TableCell>
                        <TableCell>{myStatusElement}</TableCell>
                        <TableCell className="text-center">
                             {expense.receipt_url ? ( <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleViewReceipt(expense.id, expense.receipt_url); }} disabled={true || isCurrentlyLoadingReceipt} aria-label="View Receipt (Disabled)"> {isCurrentlyLoadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-muted-foreground/50" />} </Button></TooltipTrigger><TooltipContent><p>View Receipt (Disabled)</p></TooltipContent></Tooltip> ) : ( <span className="text-xs text-muted-foreground/60">-</span> )}
                        </TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                {/* Stop propagation on Trigger click */}
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()} >
                                     <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isCurrentlySettling || isCurrentlyLoadingReceipt} aria-haspopup="true"> <MoreHorizontal className="h-4 w-4" /><span className="sr-only">Toggle menu</span> </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    {mySplit && mySplit.status === SplitStatus.Owed && (
                                        <DropdownMenuItem
                                            // Keep disabled logic
                                            disabled={true || isCurrentlySettling}
                                            className="text-muted-foreground focus:text-muted-foreground"
                                            // Remove onSelect, use nested element onClick
                                        >
                                             <div
                                                className="flex items-center w-full" // Ensure div takes full width for clicking
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Stop propagation here
                                                    handleSettleSplit(mySplit!.id);
                                                }}
                                            >
                                                {isCurrentlySettling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Mark as Settled (Disabled)
                                            </div>
                                        </DropdownMenuItem>
                                    )}
                                    {mySplit && mySplit.status === SplitStatus.Owed && <DropdownMenuSeparator />}
                                    {/* *** FIX HERE: Wrap content in div with onClick *** */}
                                    <DropdownMenuItem
                                        // Remove onSelect from here
                                        disabled={isCurrentlySettling || isCurrentlyLoadingReceipt}
                                        // Add 'p-0' or similar if padding interferes with nested div click area
                                        className="p-0" // Remove default padding to allow div to capture click
                                    >
                                         <div
                                            className="flex items-center w-full px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer" // Mimic item styling
                                            onClick={(e) => {
                                                console.log("Edit item div clicked");
                                                e.stopPropagation(); // Explicitly stop propagation
                                                handleEdit(expense);
                                            }}
                                            // Add necessary accessibility roles/attributes if needed
                                            role="menuitem"
                                            tabIndex={-1} // Match Radix behavior
                                        >
                                            <Edit className="mr-2 h-4 w-4" /> Edit
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        // Remove onSelect
                                        disabled={isCurrentlySettling || isCurrentlyLoadingReceipt}
                                        className="p-0 text-destructive focus:text-destructive" // Adjust styling classes
                                    >
                                        <div
                                             className="flex items-center w-full px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer text-destructive" // Mimic item styling + destructive text
                                             onClick={(e) => {
                                                 console.log("Delete item div clicked");
                                                 e.stopPropagation(); // Explicitly stop propagation
                                                 handleDeleteRequest(expense);
                                             }}
                                             role="menuitem"
                                             tabIndex={-1}
                                         >
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                </TooltipProvider>
            );
        });
     }, [ isLoading, error, selectedProperty, rawExpenses, filteredExpenses, hasActiveFilters, user, typedMemberProfiles,
        renderPayer, renderSplitMethod, renderMyStatus, handleEdit, handleDeleteRequest, settlingSplitId,
        loadingReceiptId, handleViewDetails, handleSettleSplit, handleViewReceipt ]);


    // --- Main Return Structure ---
    return (
        <div className="space-y-6 pb-10">
            {/* Header, Filters, Card/Table structure */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Expenses</h1><p className="text-muted-foreground text-sm sm:text-base"> View and manage expenses for {selectedProperty?.name || 'property'}. </p></div><Button onClick={() => setIsAddDialogOpen(true)} disabled={!selectedProperty || isLoading}><PlusCircle className="mr-2 h-4 w-4" /> Add Expense</Button></div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                 <div className="relative flex-1 sm:flex-initial min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input type="search" placeholder="Search..." value={searchTermInput} onChange={(e) => setSearchTermInput(e.target.value)} className="w-full rounded-lg bg-background pl-8" /></div>
                 <Select value={String(categoryFilter)} onValueChange={(value) => setCategoryFilter(value === 'all' ? 'all' : value as ExpenseCategory)}><SelectTrigger className="w-full flex-1 min-w-[180px] sm:w-auto sm:flex-none"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{Object.values(ExpenseCategory).map((cat) => (<SelectItem key={String(cat)} value={String(cat)}>{formatCategoryName(cat)}</SelectItem>))}</SelectContent></Select>
                 <Select value={payerFilter} onValueChange={(value) => setPayerFilter(value)}><SelectTrigger className="w-full flex-1 min-w-[180px] sm:w-auto sm:flex-none"><SelectValue placeholder="Payer" /></SelectTrigger><SelectContent>
                        <SelectItem value="all">All Payers</SelectItem>
                        {uniqueMemberProfilesForFilter.map((member) => {
                            if (!member.profile || !member.user_id) return null;
                            return ( <SelectItem key={member.user_id} value={member.user_id}>{member.profile.first_name ?? ''} {member.profile.last_name ?? ''} {member.user_id === user?.id ? '(You)' : ''}</SelectItem> );
                        })}
                 </SelectContent></Select>
                 {hasActiveFilters && (<Button variant="ghost" onClick={clearFilters} className="h-10 px-3"><X className="mr-2 h-4 w-4"/> Clear</Button>)}
            </div>
            <Card><CardHeader><CardTitle>Expense History</CardTitle><CardDescription>Recorded expenses for {selectedProperty?.name || 'property'}.</CardDescription></CardHeader><CardContent>
                <div className="overflow-x-auto">
                    <Table><TableHeader><TableRow>
                        <TableHead className="min-w-[150px]">Description</TableHead>
                        <TableHead>Payer</TableHead>
                        <TableHead className="text-right w-[100px]">Amount</TableHead>
                        <TableHead>Split Method</TableHead>
                        <TableHead className="w-[100px]">Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>My Status / Share</TableHead>
                        <TableHead className="text-center w-[80px]">Receipt</TableHead>
                        <TableHead className="text-right w-[50px]"><span className="sr-only">Actions</span></TableHead>
                    </TableRow></TableHeader><TableBody>
                        {renderTableRows()}
                    </TableBody></Table>
                </div>
            </CardContent></Card>

            {/* Dialogs and Sheet */}
            {selectedProperty && ( <AddExpenseDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} /> )}
            {selectedProperty && expenseToEdit && ( <EditExpenseDialog isOpen={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setExpenseToEdit(null); }} expense={expenseToEdit} /> )}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { setIsDeleteDialogOpen(open); if (!open) { setExpenseToDelete(null); setIsDeleting(false); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>Delete expense "{expenseToDelete?.description}"? Cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isDeleting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>) : "Continue"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <ExpenseDetailSheet isOpen={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen} expense={expenseForDetail} />
            {!selectedProperty && isLoading && ( <p className="text-center text-muted-foreground">Loading...</p> )}
            {!selectedProperty && !isLoading && ( <p className="text-center text-muted-foreground">Select property.</p> )}
        </div>
    );
};

export default ExpenseList;