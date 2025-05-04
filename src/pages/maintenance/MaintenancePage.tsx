// src/pages/maintenance/MaintenancePage.tsx
// v7 - Corrected renderTableBody structure and conditional returns.
//    - Moved helper functions inside component scope.
//    - Reinforced null checks in useMemo filter logic.

import React, { useState, useMemo, useCallback } from 'react';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAuth } from '@/contexts/AuthContext';
import { MaintenanceTask, MaintenanceStatus, MaintenancePriority, Profile } from '@/integrations/supabase/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge"; // Ensure Badge is imported
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, PlusCircle, Loader2, AlertTriangle, Search, X, Edit, Trash2, Link } from 'lucide-react';
import { format } from 'date-fns';
import { cn, getInitials } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { AddTaskDialog } from '@/components/maintenance/AddTaskDialog';
import { EditTaskDialog } from '@/components/maintenance/EditTaskDialog'; // Will need v15+ later

// --- Component ---
const MaintenancePage: React.FC = () => {
    const { user } = useAuth();
    const { selectedProperty } = useProperty();
    const { tasks, isLoading, error, deleteTask: deleteTaskFromContext } = useMaintenance();
    const { toast } = useToast();

    // State hooks (No changes)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<MaintenanceTask | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState<MaintenanceTask | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<any>({});
    const [sortConfig, setSortConfig] = useState<any>(null);


    // --- Badge Helper Functions (Moved Inside Component) ---
    const formatStatus = useCallback((status: MaintenanceStatus): string => {
        switch (status) {
            case MaintenanceStatus.Pending: return "Pending";
            case MaintenanceStatus.InProgress: return "In Progress";
            case MaintenanceStatus.Blocked: return "Blocked";
            case MaintenanceStatus.Completed: return "Completed";
            case MaintenanceStatus.Cancelled: return "Cancelled";
            default: return status;
        }
    }, []);

    const formatPriority = useCallback((priority: MaintenancePriority): string => {
        switch (priority) {
            case MaintenancePriority.Low: return "Low";
            case MaintenancePriority.Medium: return "Medium";
            case MaintenancePriority.High: return "High";
            default: return priority;
        }
    }, []);

    const getStatusVariant = useCallback((status: MaintenanceStatus): NonNullable<Parameters<typeof Badge>[0]>['variant'] => {
        switch (status) {
            case MaintenanceStatus.Pending: return "secondary";
            case MaintenanceStatus.InProgress: return "default";
            case MaintenanceStatus.Blocked: return "destructive";
            case MaintenanceStatus.Completed: return "outline"; // Consider adding a 'success' variant to Shadcn theme if desired
            case MaintenanceStatus.Cancelled: return "outline";
            default: return 'outline';
        }
    }, []);

    const getPriorityVariant = useCallback((priority: MaintenancePriority): NonNullable<Parameters<typeof Badge>[0]>['variant'] => {
        switch (priority) {
            case MaintenancePriority.Low: return "secondary";
            case MaintenancePriority.Medium: return "default";
            case MaintenancePriority.High: return "destructive";
            default: return 'outline';
        }
    }, []);
    // --- End Badge Helper Functions ---


    // Filtered Tasks Logic (Reinforced null checks, error handling)
    const filteredTasks = useMemo(() => {
        try {
            let items = Array.isArray(tasks) ? [...tasks] : [];

            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                items = items.filter(task => {
                    const titleMatch = (task.title?.toLowerCase() ?? '').includes(lowerSearchTerm);
                    const descMatch = (task.description?.toLowerCase() ?? '').includes(lowerSearchTerm);
                    const vendorMatch = (task.vendor_name?.toLowerCase() ?? '').includes(lowerSearchTerm);
                    const assigneeName = `${task.assignee_profile?.first_name ?? ''} ${task.assignee_profile?.last_name ?? ''}`.trim().toLowerCase();
                    const assigneeMatch = assigneeName.includes(lowerSearchTerm);
                    return titleMatch || descMatch || vendorMatch || assigneeMatch;
                });
            }

            // Apply sorting
            items.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            });

            return items;

        } catch (e) {
            console.error("Error during task filtering/sorting:", e);
            return []; // Return empty array on error
        }
    }, [tasks, searchTerm]); // Removed filters/sortConfig until implemented

    // Handlers
    const handleAdd = () => setIsAddDialogOpen(true);
    const handleEdit = useCallback((task: MaintenanceTask) => {
        console.log('MaintenancePage: Setting Task to Edit -> ', task); // Added Log
        setTaskToEdit(task);
        setIsEditDialogOpen(true);
    }, []); // Dependency array is empty as it uses state setters
    const handleDeleteRequest = useCallback((e: React.MouseEvent, task: MaintenanceTask) => {
        e.stopPropagation();
        console.log('MaintenancePage: Requesting Delete -> ', task); // Added Log
        setTaskToDelete(task);
        setIsDeleteDialogOpen(true);
     }, []);
    const handleConfirmDelete = useCallback(async () => {
        if (!taskToDelete) return;
        setIsDeleting(true);
        console.log('MaintenancePage: Confirming Delete -> ', taskToDelete.id); // Added Log
        const result = await deleteTaskFromContext(taskToDelete.id);
        setIsDeleting(false);
        if (result.error) {
             toast({ title: "Error", description: `Failed to delete task: ${result.error.message}`, variant: "destructive" });
        } else {
             toast({ title: "Success", description: `Task "${taskToDelete.title}" deleted.` });
             setIsDeleteDialogOpen(false);
             setTaskToDelete(null); // Clear task after successful delete
        }
     }, [taskToDelete, deleteTaskFromContext, toast]);
    const handleLinkExpense = useCallback((e: React.MouseEvent, task: MaintenanceTask) => {
        e.stopPropagation();
        console.log('Link Expense for Task:', task.id);
        toast({ title: "Not Implemented", description: "Linking expenses is not yet available.", variant: "default" });
     }, [toast]);
    // Row click calls handleEdit directly now
    // const handleRowClick = useCallback((task: MaintenanceTask) => {
    //     console.log('Row Click - View/Edit Task Details:', task.id);
    //     handleEdit(task);
    //  }, [handleEdit]);
    const renderAssignee = useCallback((assigneeProfile: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_url' | 'email'> | null) => {
        if (!assigneeProfile) return <span className="text-xs text-muted-foreground">Unassigned</span>;
        const initials = getInitials(`${assigneeProfile.first_name ?? ''} ${assigneeProfile.last_name ?? ''}`);
        return (
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger className="flex items-center gap-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <Avatar className="h-6 w-6"><AvatarImage src={assigneeProfile.avatar_url ?? undefined} /><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
                        <span className="text-xs truncate max-w-[100px]">{`${assigneeProfile.first_name ?? ''} ${assigneeProfile.last_name ?? ''}`}</span>
                    </TooltipTrigger>
                    <TooltipContent><p>{`${assigneeProfile.first_name ?? ''} ${assigneeProfile.last_name ?? ''}`}</p><p className="text-xs text-muted-foreground">{assigneeProfile.email ?? 'No Email'}</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
     }, []);


    // renderTableBody (Corrected structure)
    const renderTableBody = () => {
        const COL_SPAN = 7;

        if (isLoading) {
            return Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={`skel-${index}`}>
                    <TableCell colSpan={COL_SPAN}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
            ));
        }

        if (error) {
            return (
                <TableRow><TableCell colSpan={COL_SPAN} className="text-center text-destructive"><AlertTriangle className="inline-block mr-2 h-4 w-4" /> Failed to load tasks: {error.message}</TableCell></TableRow>
            );
        }

        if (!selectedProperty) {
            return (
                <TableRow><TableCell colSpan={COL_SPAN} className="text-center text-muted-foreground">Please select a property.</TableCell></TableRow>
            );
        }

        if (!Array.isArray(filteredTasks) || filteredTasks.length === 0) {
            return (
                <TableRow><TableCell colSpan={COL_SPAN} className="text-center text-muted-foreground">No maintenance tasks found{searchTerm ? ' matching your search' : ''}.</TableCell></TableRow>
            );
        }

        // Map tasks only when we have data and no errors/loading
        return filteredTasks.map((task) => (
            <TableRow key={task.id} onClick={() => handleEdit(task)} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-medium max-w-[250px] truncate" title={task.title}>
                    {task.title}
                </TableCell>
                <TableCell>
                    <Badge variant={getStatusVariant(task.status)}>
                        {formatStatus(task.status)}
                    </Badge>
                </TableCell>
                <TableCell>
                    <Badge variant={getPriorityVariant(task.priority)}>
                        {formatPriority(task.priority)}
                    </Badge>
                </TableCell>
                <TableCell>
                    {renderAssignee(task.assignee_profile || null)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                    {task.scheduled_date_start ? format(new Date(task.scheduled_date_start), 'PP') : '-'}
                    {task.blocks_booking && task.scheduled_date_start && <span title="Blocks Booking"> 🔒</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                    {task.created_at ? format(new Date(task.created_at), 'PP') : '-'}
                </TableCell>
                <TableCell className="text-right">
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Open menu</span><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(task); }}><Edit className="mr-2 h-4 w-4" /> View / Edit</DropdownMenuItem>
                            {!task.actual_cost_expense_id && (<DropdownMenuItem onClick={(e) => handleLinkExpense(e, task)}><Link className="mr-2 h-4 w-4" /> Link/Create Expense</DropdownMenuItem>)}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={(e) => handleDeleteRequest(e, task)}><Trash2 className="mr-2 h-4 w-4" /> Delete Task</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
            </TableRow>
        ));
    }; // End renderTableBody

    // --- Component Return JSX ---
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Header */}
             <div className="flex items-center justify-between mb-6"> <h1 className="text-3xl font-bold tracking-tight">Maintenance Tasks</h1> <Button onClick={handleAdd} disabled={!selectedProperty || isLoading}><PlusCircle className="mr-2 h-4 w-4" /> Add Task</Button> </div>
             {/* Search and Filters */}
             <div className="mb-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm flex flex-col sm:flex-row items-center gap-4"> {/* Search Input */} <div className="relative flex-grow w-full sm:w-auto"> <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /> <Input placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full" disabled={!selectedProperty || isLoading} /> {searchTerm && ( <Button variant="ghost" size="sm" className="absolute right-1.5 top-1.5 h-7 w-7 p-0" onClick={() => setSearchTerm('')}><X className="h-4 w-4" /></Button> )} </div> {/* Filter Buttons */} <div className="flex gap-2 flex-shrink-0"> <Button variant="outline" disabled>Status Filter <X className='ml-2 h-4 w-4'/></Button> <Button variant="outline" disabled>Priority Filter <X className='ml-2 h-4 w-4'/></Button> <Button variant="outline" disabled>Assignee Filter <X className='ml-2 h-4 w-4'/></Button> </div> </div>
             {/* Task Table Card */}
             <Card>
                  <CardHeader> <CardTitle>Task List</CardTitle> <CardDescription> All reported and ongoing maintenance for {selectedProperty?.name || 'the selected property'}. {isLoading && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />} </CardDescription> </CardHeader>
                  <CardContent>
                      <div className="overflow-x-auto">
                          <Table>
                              <TableHeader>
                                  {/* Ensure no extra whitespace */}
                                  <TableRow>
                                      <TableHead className="min-w-[250px]">Title</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Priority</TableHead>
                                      <TableHead>Assignee</TableHead>
                                      <TableHead>Scheduled</TableHead>
                                      <TableHead>Reported</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                  {/* Ensure no extra whitespace */}
                              </TableHeader>
                              {/* Ensure no extra whitespace */}
                              <TableBody>
                                  {renderTableBody()}
                              </TableBody>
                              {/* Ensure no extra whitespace */}
                          </Table>
                      </div>
                  </CardContent>
              </Card>
             {/* Dialogs */}
             <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>{/* ... Delete Dialog ... */}</AlertDialog>
             <AddTaskDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
             {/* Ensure EditTaskDialog receives the taskToEdit state */}
             <EditTaskDialog isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} task={taskToEdit} />
        </div>
    );
};
export default MaintenancePage;