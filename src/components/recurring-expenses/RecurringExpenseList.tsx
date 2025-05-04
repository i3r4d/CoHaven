// src/components/recurring-expenses/RecurringExpenseList.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { useRecurringExpense } from '@/contexts/RecurringExpenseContext';
import { useProperty } from '@/contexts/PropertyContext';
import { Input } from '@/components/ui/input';
import {
    RecurringExpense,
    Profile,
    RecurringExpenseSortKey,
    SortDirection,
    TemplateStatus,
    SplitMethod,
    PropertyMemberWithProfile
} from '@/integrations/supabase/types';
import {
    compareAsc, compareDesc, startOfDay, parseISO, isValid as isValidDate
} from 'date-fns';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertCircle, Edit, Trash2, Loader2, ArrowUpDown, Copy, Filter, Search
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    getInitials, cn, formatFrequencyDetailed, formatDate, formatCurrency, formatSplitMethod, getTemplateStatus, ConcreteTemplateStatus
} from '@/lib/utils';

// --- Helper Functions ---
const statusOrder: Record<ConcreteTemplateStatus, number> = { 'active': 1, 'paused': 2, 'ended': 3 };

// --- Props Interface ---
interface RecurringExpenseListProps {
    onEdit: (expense: RecurringExpense) => void;
    onDuplicate: (expense: RecurringExpense) => void;
    onViewDetails: (expense: RecurringExpense) => void;
}

// --- Component ---
export function RecurringExpenseList({ onEdit, onDuplicate, onViewDetails }: RecurringExpenseListProps) {
    const { recurringExpenses, isLoading, error, deleteRecurringExpense, toggleRecurringExpenseActive } = useRecurringExpense();
    const { propertyMembers } = useProperty();
    const [sortKey, setSortKey] = useState<RecurringExpenseSortKey>('next_due_date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [statusFilter, setStatusFilter] = useState<TemplateStatus>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isToggling, setIsToggling] = useState<string | null>(null);

    const handleEdit = (e: React.MouseEvent, expense: RecurringExpense) => { e.stopPropagation(); onEdit(expense); };
    const handleDelete = async (e: React.MouseEvent, expenseId: string) => { e.stopPropagation(); setIsDeleting(expenseId); await deleteRecurringExpense(expenseId); setIsDeleting(null); };
    const handleToggleActive = async (expense: RecurringExpense) => { if (getTemplateStatus(expense) === 'ended') return; setIsToggling(expense.id); await toggleRecurringExpenseActive(expense.id, !expense.is_active); setIsToggling(null); };
    const handleDuplicate = (e: React.MouseEvent, expense: RecurringExpense) => { e.stopPropagation(); onDuplicate(expense); };
    const handleSort = (key: RecurringExpenseSortKey) => { if (sortKey === key) { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); } else { setSortKey(key); setSortDirection('asc'); } };
    const handleRowClick = (expense: RecurringExpense) => { onViewDetails(expense); };

    const getPayerProfile = useCallback((userId: string): Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_url' | 'email'> | null => {
        if (!Array.isArray(propertyMembers)) return null;
        const member = propertyMembers.find((m: PropertyMemberWithProfile) => m.user_id === userId);
        return member?.profile || null;
    }, [propertyMembers]);


    const filteredAndSortedExpenses = useMemo(() => {
        let items = Array.isArray(recurringExpenses) ? [...recurringExpenses] : [];
        if (searchTerm) {
            items = items.filter(exp => exp.description?.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        if (statusFilter !== 'all') {
            items = items.filter(exp => getTemplateStatus(exp) === statusFilter);
        }
        items.sort((a, b) => {
            let valA: any;
            let valB: any;
            try {
                switch (sortKey) {
                    case 'description': valA = a.description?.toLowerCase() ?? ''; valB = b.description?.toLowerCase() ?? ''; break;
                    case 'next_due_date': valA = a.next_due_date && isValidDate(parseISO(a.next_due_date)) ? parseISO(a.next_due_date) : null; valB = b.next_due_date && isValidDate(parseISO(b.next_due_date)) ? parseISO(b.next_due_date) : null; break;
                    case 'amount': valA = typeof a.amount === 'number' ? a.amount : -Infinity; valB = typeof b.amount === 'number' ? b.amount : -Infinity; break;
                    case 'payer':
                        const profileA = a.paid_by_user_id ? getPayerProfile(a.paid_by_user_id) : null;
                        const profileB = b.paid_by_user_id ? getPayerProfile(b.paid_by_user_id) : null;
                        valA = profileA ? `${profileA.first_name} ${profileA.last_name}`.toLowerCase() : 'zzzz';
                        valB = profileB ? `${profileB.first_name} ${profileB.last_name}`.toLowerCase() : 'zzzz';
                        break;
                    case 'status': valA = statusOrder[getTemplateStatus(a)]; valB = statusOrder[getTemplateStatus(b)]; break;
                    default: return 0;
                }
                let comparison = 0;
                if (sortKey === 'next_due_date') {
                    if (valA === null && valB === null) comparison = 0;
                    else if (valA === null) comparison = 1;
                    else if (valB === null) comparison = -1;
                    else comparison = compareAsc(valA, valB);
                } else if (valA < valB) { comparison = -1; } else if (valA > valB) { comparison = 1; }
                return sortDirection === 'asc' ? comparison : comparison * -1;
            } catch (e) {
                console.error("Error during sorting comparison:", e, { a, b, sortKey });
                return 0;
            }
        });
        return items;
    }, [recurringExpenses, statusFilter, sortKey, sortDirection, getPayerProfile, searchTerm]);

    // Render Logic (Skeleton and Error states unchanged)
    if (isLoading) { return ( <Card><CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><div className="space-y-2">{[...Array(5)].map((_, i) => ( <div key={i} className="flex items-center space-x-4 p-2"><Skeleton className="h-8 w-8 rounded-full" /><div className="flex-1 space-y-1"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-3 w-1/5" /></div><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /></div> ))}</div></CardContent></Card> ); }
    if (error) { return ( <Card className="border-destructive"><CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertCircle size={20} /> Error Loading Templates</CardTitle></CardHeader><CardContent><p>Failed to load recurring expense templates.</p><p className="text-sm text-muted-foreground mt-2">{error}</p></CardContent></Card> ); }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4"> <div> <CardTitle>Expense Templates</CardTitle> <CardDescription> Automated templates for costs like rent, utilities, etc. <span className="block text-xs text-muted-foreground mt-1"> Expenses are generated automatically based on their schedule (typically runs daily). </span> </CardDescription> </div> <DropdownMenu> <DropdownMenuTrigger className={cn( "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", "border border-input bg-background hover:bg-accent hover:text-accent-foreground", "h-10 px-4 py-2" )}> <Filter className="mr-2 h-4 w-4" /> Filter ({statusFilter === 'all' ? 'All' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}) </DropdownMenuTrigger> <DropdownMenuContent align="end"> <DropdownMenuLabel>Filter by Status</DropdownMenuLabel> <DropdownMenuSeparator /> {(['all', 'active', 'paused', 'ended'] as TemplateStatus[]).map((status) => ( <DropdownMenuCheckboxItem key={status} checked={statusFilter === status} onCheckedChange={() => setStatusFilter(status)} > {status.charAt(0).toUpperCase() + status.slice(1)} </DropdownMenuCheckboxItem> ))} </DropdownMenuContent> </DropdownMenu> </div>
                 <div className="relative"> <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /> <Input type="search" placeholder="Search by description..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full sm:w-[300px]" /> </div>
            </CardHeader>
            <CardContent>
                 {(filteredAndSortedExpenses.length === 0 && (searchTerm || statusFilter !== 'all')) ? ( <div className="text-center text-muted-foreground py-8"> <p className="text-lg mb-2">No templates match the current search/filter.</p> <p>Try adjusting the search or filter settings.</p> </div> ) : (!Array.isArray(recurringExpenses) || recurringExpenses.length === 0) ? ( <div className="text-center text-muted-foreground py-8"> <p className="text-lg mb-2">No recurring expense templates yet.</p> <p>Click "Add Recurring Expense" to create one.</p> </div> ) : (
                     <TooltipProvider>
                         <Table>
                             <TableHeader><TableRow>
                                 <TableHead className="min-w-[150px]"><Button variant="ghost" onClick={() => handleSort('description')} className="px-1">Description<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                 <TableHead>Payer</TableHead>
                                 <TableHead className="text-right w-[100px]"><Button variant="ghost" onClick={() => handleSort('amount')} className="px-1 justify-end w-full">Amount<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                 <TableHead>Split Method</TableHead>
                                 <TableHead>Frequency</TableHead>
                                 <TableHead className="w-[100px]"><Button variant="ghost" onClick={() => handleSort('next_due_date')} className="px-1">Next Due<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                 <TableHead>Ends On</TableHead>
                                 <TableHead>Status</TableHead>
                                 <TableHead className="text-right w-[100px]">Actions</TableHead>
                             </TableRow></TableHeader>
                             <TableBody>
                                 {filteredAndSortedExpenses.map((expense) => {
                                      if (!expense || !expense.id) { return null; }
                                      const currentStatus = getTemplateStatus(expense);
                                      const payerProfile = expense.paid_by_user_id ? getPayerProfile(expense.paid_by_user_id) : null;
                                      const isEnded = currentStatus === 'ended';
                                      const safeDescription = expense.description ?? 'No Description';
                                      return (
                                          <TableRow key={expense.id} onClick={() => handleRowClick(expense)} className="cursor-pointer hover:bg-muted/50 transition-colors">
                                              <TableCell className="font-medium max-w-[150px] truncate" title={safeDescription}>{safeDescription}</TableCell>
                                              <TableCell>{ payerProfile ? ( <Tooltip> <TooltipTrigger className="inline-flex items-center space-x-2 cursor-default" onClick={(e) => e.stopPropagation()}> <Avatar className="h-6 w-6"> <AvatarImage src={payerProfile.avatar_url ?? undefined} alt={`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`} /> <AvatarFallback className="text-xs">{getInitials(`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`)}</AvatarFallback> </Avatar> <span className="truncate">{`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`}</span> </TooltipTrigger> <TooltipContent> <p>{`${payerProfile.first_name ?? ''} ${payerProfile.last_name ?? ''}`}</p> <p className="text-xs text-muted-foreground">{payerProfile.email ?? 'No Email'}</p> </TooltipContent> </Tooltip> ) : ( <span className="text-muted-foreground text-xs">Unknown Payer</span> )} </TableCell>
                                              <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                                              <TableCell>{formatSplitMethod(expense.split_method)}</TableCell>
                                              <TableCell>{formatFrequencyDetailed(expense.frequency, expense.interval)}</TableCell>
                                              <TableCell>{formatDate(expense.next_due_date)}</TableCell>
                                              <TableCell>{expense.end_date ? formatDate(expense.end_date) : 'Never'}</TableCell>
                                              <TableCell><div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}> <Switch id={`toggle-${expense.id}`} checked={expense.is_active && !isEnded} onCheckedChange={() => handleToggleActive(expense)} disabled={isToggling === expense.id || isEnded} aria-label={expense.is_active ? 'Pause template' : 'Resume template'} /> <Badge variant={isEnded ? "outline" : (expense.is_active ? "default" : "secondary")}> {isToggling === expense.id ? <Loader2 className="h-3 w-3 animate-spin" /> : ( currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1) )} </Badge> </div></TableCell>
                                              <TableCell className="text-right"><div className="flex justify-end space-x-1">
                                                {/* Edit Button (remains wrapped in Tooltip) */}
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800" onClick={(e) => handleEdit(e, expense)} disabled={isDeleting === expense.id}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Edit Template</TooltipContent>
                                                </Tooltip>
                                                {/* Duplicate Button (remains wrapped in Tooltip) */}
                                                <Tooltip>
                                                     <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-gray-800" onClick={(e) => handleDuplicate(e, expense)} disabled={isDeleting === expense.id}>
                                                            <Copy className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Duplicate Template</TooltipContent>
                                                </Tooltip>
                                                {/* CORRECTED: Delete Button - Tooltip removed */}
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild disabled={isDeleting === expense.id}>
                                                         <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-red-800" disabled={isDeleting === expense.id} onClick={(e) => e.stopPropagation()}>
                                                            {isDeleting === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                     </AlertDialogTrigger>
                                                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                                            <AlertDialogDescription> Permanently delete the template "{safeDescription}"? </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel disabled={isDeleting === expense.id}>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={(e) => handleDelete(e, expense.id)} className="bg-destructive hover:bg-red-700" disabled={isDeleting === expense.id}>
                                                                {isDeleting === expense.id ? 'Deleting...' : 'Confirm Delete'}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                                </div></TableCell>
                                          </TableRow>
                                      );
                                 })}
                             </TableBody>
                         </Table>
                     </TooltipProvider>
                 )}
            </CardContent>
        </Card>
    );
}