// src/pages/recurring-expenses/RecurringExpensesPage.tsx
import React, { useState } from 'react';
import { RecurringExpenseList } from '@/components/recurring-expenses/RecurringExpenseList';
import { EditRecurringExpenseDialog } from '@/components/recurring-expenses/EditRecurringExpenseDialog';
import { AddRecurringExpenseDialog } from '@/components/recurring-expenses/AddRecurringExpenseDialog';
import { RecurringExpenseDetailSheet } from '@/components/recurring-expenses/RecurringExpenseDetailSheet'; // Import the new Sheet component
import { RecurringExpense } from '@/integrations/supabase/types';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

export function RecurringExpensesPage() {
    const { selectedProperty, isLoading: propertyLoading } = useProperty();

    // State for Edit dialog
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<RecurringExpense | null>(null);

    // State for Add/Duplicate dialog
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [initialDataForDialog, setInitialDataForDialog] = useState<RecurringExpense | null>(null);

    // State for Detail Sheet
    const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
    const [expenseForDetail, setExpenseForDetail] = useState<RecurringExpense | null>(null);


    // Handler to open Edit dialog
    const handleOpenEditDialog = (expense: RecurringExpense) => {
        setExpenseToEdit(expense);
        setIsEditDialogOpen(true);
    };

    // Handler to open Add dialog (for new entry)
    const handleOpenAddDialog = () => {
        setInitialDataForDialog(null);
        setIsAddDialogOpen(true);
    };

    // Handler to open Add dialog (for duplication)
    const handleDuplicate = (expense: RecurringExpense) => {
        console.log("Duplicating expense:", expense);
        setInitialDataForDialog(expense);
        setIsAddDialogOpen(true);
    };

     // Handler to open Detail Sheet
     const handleViewDetails = (expense: RecurringExpense) => {
        setExpenseForDetail(expense);
        setIsDetailSheetOpen(true);
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                        Recurring Expenses
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base">
                        Manage automated expense templates for{' '}
                        {selectedProperty?.name || 'your property'}.
                    </p>
                </div>
                {/* Conditionally render Add button */}
                {selectedProperty && !propertyLoading && (
                     <Button onClick={handleOpenAddDialog}>
                         <span className="flex items-center">
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Recurring Expense
                         </span>
                     </Button>
                )}
                {propertyLoading && (
                    <span className="text-sm text-muted-foreground">Loading property...</span>
                )}
                {!selectedProperty && !propertyLoading && (
                    <span className="text-sm text-muted-foreground">Select a property to manage templates.</span>
                )}
            </div>

            {/* Main Content Area - Render the List */}
            {/* Pass handlers down, including onViewDetails */}
            <RecurringExpenseList
                onEdit={handleOpenEditDialog}
                onDuplicate={handleDuplicate}
                onViewDetails={handleViewDetails} // Pass detail handler
            />

            {/* Render the Add/Duplicate Dialog (Controlled) */}
            <AddRecurringExpenseDialog
                isOpen={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                initialData={initialDataForDialog}
                isDuplicate={!!initialDataForDialog}
            />

            {/* Render the Edit Dialog (Controlled) */}
            <EditRecurringExpenseDialog
                isOpen={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                expenseToEdit={expenseToEdit}
            />

            {/* Render the Detail Sheet (Controlled) */}
            <RecurringExpenseDetailSheet
                isOpen={isDetailSheetOpen}
                onOpenChange={setIsDetailSheetOpen}
                expense={expenseForDetail}
            />
        </div>
    );
}

export default RecurringExpensesPage;