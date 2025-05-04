// src/pages/Dashboard.tsx (Restored Original + Minimal Validated Fixes)

import {
  CalendarIcon,
  PlusIcon,
  CreditCardIcon,
  Wrench, // Use Wrench consistently
  CalendarDays,
  ReceiptText,
  History,
  AlertCircle,
  Users,
  DollarSign,
  ListTodo,
  Home as BookingIcon,
  Receipt as ExpenseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "react-router-dom";
import { useProperty } from "@/contexts/PropertyContext";
import { useUpcomingBookings, UpcomingBookingWithUser } from "@/hooks/useUpcomingBookings";
import { useRecentExpenses } from "@/hooks/useRecentExpenses"; // No 'RecentExpense' type needed here
import { useRecentActivity, AggregatedActivityItem } from "@/hooks/useRecentActivity";
import { useFinancialSnapshot, FinancialSnapshotData } from "@/hooks/useFinancialSnapshot"; // Keep FinancialSnapshotData if defined/used
// --- FIX: Removed incorrect import of ActionableMaintenanceItem ---
import { useActionableMaintenance } from "@/hooks/useActionableMaintenance";
import { format, parseISO, isPast, formatDistanceToNowStrict } from 'date-fns';
import { cn } from "@/lib/utils";
// --- FIX: Ensure needed types are imported ---
import { MaintenanceTask, Expense, Profile } from "@/integrations/supabase/types";
import { PostgrestError } from "@supabase/supabase-js"; // For type checking errors

// --- Helper Functions ---

// --- FIX: Renamed helper and updated logic for scheduled_date_start ---
const formatScheduledDate = (dateStr: string | null): { text: string, isOverdue: boolean } => {
    if (!dateStr) return { text: 'Not scheduled', isOverdue: false };
    try {
        const date = parseISO(dateStr); // Still need parseISO here as input is string | null
        if (isNaN(date.getTime())) throw new Error("Invalid date string provided");
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const overdue = date < todayStart;
        const distance = formatDistanceToNowStrict(date, { addSuffix: true });
        return { text: `Scheduled ${distance}`, isOverdue: overdue };
    } catch (e) {
        console.error("Error formatting scheduled date:", e);
        return { text: 'Invalid date', isOverdue: false };
    }
};

// Original helpers (Keep original implementation)
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const formatDateRange = (startDateStr: string, endDateStr: string) => { try { const start = parseISO(startDateStr); const end = parseISO(endDateStr); return start.getMonth() === end.getMonth() ? `${format(start, 'MMM d')} - ${format(end, 'd')}` : `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`; } catch (e) { return "Invalid date"; } };
const formatSingleDate = (dateStr: string) => { try { return format(parseISO(dateStr), 'PP'); } catch (e) { return "Invalid date"; } };
// --- FIX: Added Pick for stricter type checking on profile helpers ---
const getUserShortName = (profile: Pick<Profile, 'first_name' | 'last_name'> | null): string => { if (!profile) return 'System'; const first = profile.first_name || ''; const last = profile.last_name || ''; if (first && last) return `${first} ${last.charAt(0)}.`; if (first) return first; if (last) return last; return 'User'; };
const getUserInitials = (profile: Pick<Profile, 'first_name' | 'last_name'> | null): string => { if (!profile) return '?'; return ((profile.first_name?.charAt(0) || '') + (profile.last_name?.charAt(0) || '')).toUpperCase() || '?'; }

// --- FIX: Added displayError helper ---
const displayError = (error: string | PostgrestError | Error | null | undefined): string => {
    if (!error) return 'An unknown error occurred.';
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    // Basic fallback for other object types
    if (typeof error === 'object' && error !== null) {
        try { return JSON.stringify(error); } catch { /* ignore */ }
    }
    return 'An unexpected error format occurred.';
};

// --- Skeleton Component ---
const Skeleton = ({ className }: { className?: string }) => ( <div className={cn("animate-pulse rounded-md bg-gray-200", className)} /> );

// --- Helper Component for Activity Icon ---
const ActivityIcon = ({ type }: { type: AggregatedActivityItem['type'] }) => {
  switch (type) {
    case 'booking': return <BookingIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />;
    case 'expense': return <ExpenseIcon className="h-4 w-4 text-green-600 flex-shrink-0" />;
    case 'maintenance': return <Wrench className="h-4 w-4 text-orange-600 flex-shrink-0" />; // Use Wrench
    default: return <History className="h-4 w-4 text-gray-500 flex-shrink-0" />;
  }
};


// --- Dashboard Component ---
const Dashboard = () => {
  const { properties, selectedProperty, isLoading: isLoadingProperties } = useProperty();
  const propertyId = selectedProperty?.id;

  // --- FIX: Corrected Hook Calls ---
  const { bookings, isLoading: isLoadingBookings, error: errorBookings } = useUpcomingBookings(propertyId, 3);
  const { expenses, isLoading: isLoadingExpenses, error: errorExpenses } = useRecentExpenses(propertyId, 3);
  const { financialData, isLoading: isLoadingFinancial, error: errorFinancial } = useFinancialSnapshot(propertyId);
  const { actionableTasks, isLoading: isLoadingMaintenance, error: errorMaintenance } = useActionableMaintenance(5); // Takes only limit
  const { activity, isLoading: isLoadingActivity, error: errorActivity } = useRecentActivity(propertyId, 7);


  // --- Loading/Get Started States --- (Original structure)
    if (isLoadingProperties && (!properties || properties.length === 0)) { // Added !properties check
      return ( <div className="flex justify-center items-center h-64"><p className="text-gray-600">Loading properties...</p></div> );
    }
    const hasProperties = properties && properties.length > 0; // Added properties check
    if (!hasProperties && !isLoadingProperties) { // Added !isLoadingProperties check
        // --- Original Get Started View ---
        return (
          <div className="max-w-3xl mx-auto text-center py-12 md:py-20 space-y-8 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-semibold text-gray-800 font-poppins">Welcome to CoHaven</h1>
            <p className="text-lg text-gray-600 px-4">Manage your shared property effortlessly. Let's get started.</p>
            <Card className="shadow-md"><CardHeader><CardTitle className="text-xl font-semibold font-poppins">Create Your First Property</CardTitle><CardDescription className="text-gray-600">Add the details of your co-owned space to begin managing it.</CardDescription></CardHeader><CardContent className="flex justify-center py-6"><Link to="/properties/new"><Button size="lg" className="bg-slate-700 hover:bg-slate-800 text-white shadow hover:shadow-md transition-all"><PlusIcon className="mr-2 h-5 w-5" />Create Property</Button></Link></CardContent></Card>
          </div>
        );
     }

  // --- Status Badge Helper --- (Original, adjusted slightly for safety)
    const getStatusBadgeClass = (status?: string | null): string => {
        const lowerStatus = status?.toLowerCase() || '';
        if (lowerStatus.includes('complete')) return 'bg-green-100 text-green-800';
        if (lowerStatus.includes('progress') || lowerStatus.includes('active') || lowerStatus.includes('scheduled')) return 'bg-amber-100 text-amber-800';
        if (lowerStatus.includes('pending') || lowerStatus.includes('open') || lowerStatus.includes('reported')) return 'bg-blue-100 text-blue-800';
        if (lowerStatus.includes('cancelled') || lowerStatus.includes('declined') || lowerStatus.includes('blocked')) return 'bg-red-100 text-red-800';
        return 'bg-gray-100 text-gray-800';
    };

  // --- Main Dashboard View --- (Restored Original JSX Structure)
  return (
    <div className="space-y-8 animate-fade-in text-gray-900">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
         <div><h1 className="text-3xl font-bold text-gray-800 font-poppins">Dashboard</h1>{selectedProperty && ( <p className="text-sm text-gray-600 mt-1">Viewing data for: <span className="font-semibold text-gray-700">{selectedProperty.name}</span></p> )}{!selectedProperty && hasProperties && ( <p className="text-sm text-orange-600 font-medium mt-1">Please select a property from the sidebar.</p> )}</div>
      </div>

       {selectedProperty ? (
         <>
            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                 {/* Original Quick Action cards */}
                 <Link to="/expenses"><Card className="bg-white hover:border-teal-300 border border-gray-200 transition-all duration-150 ease-in-out cursor-pointer h-full shadow-sm hover:shadow-md"><CardContent className="p-4 flex flex-col items-center text-center space-y-1"><CreditCardIcon className="h-7 w-7 mb-1 text-teal-700" /><h3 className="font-semibold text-slate-800 font-poppins">Add Expense</h3><p className="text-sm text-gray-600">Log a new cost</p></CardContent></Card></Link>
                 <Link to="/calendar"><Card className="bg-white hover:border-teal-300 border border-gray-200 transition-all duration-150 ease-in-out cursor-pointer h-full shadow-sm hover:shadow-md"><CardContent className="p-4 flex flex-col items-center text-center space-y-1"><CalendarIcon className="h-7 w-7 mb-1 text-teal-700" /><h3 className="font-semibold text-slate-800 font-poppins">Book Stay</h3><p className="text-sm text-gray-600">Schedule your visit</p></CardContent></Card></Link>
                 <Link to="/co-owners"><Card className="bg-white hover:border-teal-300 border border-gray-200 transition-all duration-150 ease-in-out cursor-pointer h-full shadow-sm hover:shadow-md"><CardContent className="p-4 flex flex-col items-center text-center space-y-1"><Users className="h-7 w-7 mb-1 text-teal-700" /><h3 className="font-semibold text-slate-800 font-poppins">Invite Co-Owner</h3><p className="text-sm text-gray-600">Add members</p></CardContent></Card></Link>
                 <Link to="/maintenance"><Card className="bg-white hover:border-teal-300 border border-gray-200 transition-all duration-150 ease-in-out cursor-pointer h-full shadow-sm hover:shadow-md"><CardContent className="p-4 flex flex-col items-center text-center space-y-1"><Wrench className="h-7 w-7 mb-1 text-teal-700" /><h3 className="font-semibold text-slate-800 font-poppins">Add Maintenance</h3><p className="text-sm text-gray-600">Report an issue</p></CardContent></Card></Link>
            </div>

            {/* Overview Cards - 2x2 GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upcoming Bookings */}
                <Card className="shadow-md border border-gray-200 flex flex-col bg-white">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-semibold text-gray-800 font-poppins">Upcoming Bookings</CardTitle><CardDescription className="text-gray-600">Next scheduled stays</CardDescription></CardHeader>
                    <CardContent className="flex-grow text-sm min-h-[140px]">
                        {isLoadingBookings ? ( <div className="space-y-3 py-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                        ) : errorBookings ? ( <div className="flex flex-col items-center justify-center py-10 text-red-600"><AlertCircle className="h-8 w-8 mb-2" /><p className="text-center font-medium">{displayError(errorBookings)}</p></div> // FIX: Use displayError
                        ) : !bookings || bookings.length === 0 ? ( <div className="flex flex-col items-center justify-center py-10 text-gray-500 space-y-3"><CalendarDays className="h-10 w-10 text-gray-400" /><p className="text-center">No upcoming bookings.</p></div> // FIX: Added !bookings check
                        ) : (
                            <ul className="space-y-1 -mx-2">
                                {bookings.map((booking: UpcomingBookingWithUser) => (
                                    <li key={booking.id} className="flex items-center justify-between p-2 rounded-md group hover:bg-gray-100 transition-colors">
                                        <span className="text-gray-800">{formatDateRange(booking.start_date, booking.end_date)}:</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-700 text-right">{getUserShortName(booking.profile)}</span>
                                            <Avatar className="h-6 w-6 text-xs">
                                                <AvatarImage src={booking.profile?.avatar_url ?? undefined} alt={getUserShortName(booking.profile)} />
                                                <AvatarFallback>{getUserInitials(booking.profile)}</AvatarFallback>
                                            </Avatar>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                         )}
                    </CardContent>
                    <CardFooter className="border-t bg-gray-50/50 px-6 py-3 mt-auto"><Link to="/calendar" className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-gray-100 rounded px-2 py-1 transition-colors w-full text-center">View Full Calendar</Link></CardFooter>
                </Card>

                {/* Recent Expenses */}
                <Card className="shadow-md border border-gray-200 flex flex-col bg-white">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-semibold text-gray-800 font-poppins">Recent Expenses</CardTitle><CardDescription className="text-gray-600">Latest logged expenses</CardDescription></CardHeader>
                    <CardContent className="flex-grow text-sm min-h-[140px]">
                         {isLoadingExpenses ? (<div className="space-y-3 py-2"><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-10/12" /></div>
                        ) : errorExpenses ? ( <div className="flex flex-col items-center justify-center py-10 text-red-600"><AlertCircle className="h-8 w-8 mb-2" /><p className="text-center font-medium">{displayError(errorExpenses)}</p></div> // FIX: Use displayError
                        ) : !expenses || expenses.length === 0 ? ( <div className="flex flex-col items-center justify-center py-10 text-gray-500 space-y-3"><ReceiptText className="h-10 w-10 text-gray-400" /><p className="text-center">No recent expenses.</p></div> // FIX: Added !expenses check
                        ) : (
                            <ul className="space-y-1 -mx-2">
                                {/* --- FIX: Added Expense type --- */}
                                {expenses.map((expense: Expense) => (
                                     <li key={expense.id} className="flex items-center justify-between p-2 rounded-md group hover:bg-gray-100 transition-colors gap-2">
                                        <span className="truncate flex-1 text-gray-800"><span className="font-medium">{formatSingleDate(expense.date)}:</span> {expense.description}</span>
                                        <span className="font-semibold text-gray-700 whitespace-nowrap">{formatCurrency(expense.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                         )}
                    </CardContent>
                    <CardFooter className="border-t bg-gray-50/50 px-6 py-3 mt-auto"><Link to="/expenses" className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-gray-100 rounded px-2 py-1 transition-colors w-full text-center">View All Expenses</Link></CardFooter>
                </Card>

                {/* Financial Snapshot */}
                <Card className="shadow-md border border-gray-200 flex flex-col bg-white">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-semibold text-gray-800 font-poppins">Financial Snapshot</CardTitle><CardDescription className="text-gray-600">Summary for {financialData?.monthName || 'this month'}</CardDescription></CardHeader>
                    <CardContent className="flex-grow text-sm min-h-[140px] flex items-center justify-center">
                         {isLoadingFinancial ? ( <div className="space-y-2 flex flex-col items-center"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-24" /></div>
                        ) : errorFinancial ? ( <div className="flex flex-col items-center justify-center text-red-600"><AlertCircle className="h-8 w-8 mb-2" /><p className="text-center font-medium">{displayError(errorFinancial)}</p></div> // FIX: Use displayError
                        ) : financialData ? (
                            <div className="text-center">
                                <div className="text-3xl font-bold text-gray-800">{formatCurrency(financialData.totalExpensesThisMonth)}</div>
                                <div className="text-sm text-gray-500 mt-1">Total Expenses</div>
                            </div>
                         ) : ( <div className="flex flex-col items-center justify-center text-gray-500 space-y-3"><DollarSign className="h-10 w-10 text-gray-400" /><p className="text-center">No financial data yet.</p></div> )}
                    </CardContent>
                    <CardFooter className="border-t bg-gray-50/50 px-6 py-3 mt-auto"><Link to="/expenses" className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-gray-100 rounded px-2 py-1 transition-colors w-full text-center">View Expense Details</Link></CardFooter>
                </Card>

                 {/* Actionable Maintenance */}
                 <Card className="shadow-md border border-gray-200 flex flex-col bg-white">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-semibold text-gray-800 font-poppins">Actionable Maintenance</CardTitle><CardDescription className="text-gray-600">Upcoming or overdue tasks</CardDescription></CardHeader>
                    <CardContent className="flex-grow text-sm min-h-[140px]">
                         {isLoadingMaintenance ? ( <div className="space-y-3 py-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-10/12" /></div>
                        ) : errorMaintenance ? ( <div className="flex flex-col items-center justify-center py-10 text-red-600"><AlertCircle className="h-8 w-8 mb-2" /><p className="text-center font-medium">{displayError(errorMaintenance)}</p></div> // FIX: Use displayError
                        ) : !actionableTasks || actionableTasks.length === 0 ? ( <div className="flex flex-col items-center justify-center py-10 text-gray-500 space-y-3"><ListTodo className="h-10 w-10 text-gray-400" /><p className="text-center">No actionable tasks.</p></div> // FIX: Added !actionableTasks check
                        ) : (
                            <ul className="space-y-1 -mx-2">
                                {/* --- FIX: Use MaintenanceTask type and scheduled_date_start --- */}
                                {actionableTasks.map((task: MaintenanceTask) => {
                                    const scheduleInfo = formatScheduledDate(task.scheduled_date_start); // Use correct helper and field
                                    return (
                                         <li key={task.id} className="flex items-center justify-between p-2 rounded-md group hover:bg-gray-100 transition-colors gap-2">
                                            <span className="truncate flex-1 text-gray-800">
                                                <span className={cn("font-medium", scheduleInfo.isOverdue ? "text-red-600" : "text-gray-600")}>{scheduleInfo.text}:</span> {task.title}
                                            </span>
                                            <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap", getStatusBadgeClass(task.status))}>
                                                {task.status || 'Unknown'}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                         )}
                    </CardContent>
                    <CardFooter className="border-t bg-gray-50/50 px-6 py-3 mt-auto"><Link to="/maintenance" className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-gray-100 rounded px-2 py-1 transition-colors w-full text-center">View All Maintenance</Link></CardFooter>
                </Card>

            </div> {/* End of 2x2 Grid */}

            {/* Recent Activity Feed (Aggregated) */}
            <Card className="shadow-md border border-gray-200 flex flex-col bg-white">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-gray-800 font-poppins">Recent Activity</CardTitle>
                    <CardDescription className="text-gray-600">
                        Latest updates for <span className="font-medium text-gray-700">{selectedProperty.name}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow text-sm min-h-[220px]">
                     {isLoadingActivity ? ( <div className="space-y-3 py-2">{[...Array(7)].map((_, i) => ( <Skeleton key={i} className="h-8 w-full" /> ))}</div>
                    ) : errorActivity ? ( <div className="flex flex-col items-center justify-center py-12 text-red-600"><AlertCircle className="h-8 w-8 mb-2" /><p className="text-center font-medium">{displayError(errorActivity)}</p></div> // FIX: Use displayError
                    ) : !activity || activity.length === 0 ? ( <div className="flex flex-col items-center justify-center py-12 text-gray-500 space-y-3"><History className="h-10 w-10 text-gray-400" /><p className="text-center">No recent activity.</p></div> // FIX: Added !activity check
                    ) : (
                        <ul className="space-y-1 -mx-2">
                            {activity.map((item: AggregatedActivityItem) => (
                                <li key={item.id} className="flex items-center gap-3 p-2 rounded-md group hover:bg-gray-100 transition-colors">
                                    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gray-100 rounded-full"> <ActivityIcon type={item.type} /> </div>
                                    <Avatar className="h-7 w-7 text-xs flex-shrink-0"> <AvatarImage src={item.user_profile?.avatar_url ?? undefined} alt={getUserShortName(item.user_profile)} /> <AvatarFallback>{getUserInitials(item.user_profile)}</AvatarFallback> </Avatar>
                                    <div className="flex-grow overflow-hidden"> <span className="font-medium text-gray-800">{getUserShortName(item.user_profile)}</span> <span className="text-gray-600"> {item.description}</span> </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap ml-auto pl-2">
                                        {/* --- FIX: Removed parseISO as item.timestamp is already Date --- */}
                                        {formatDistanceToNowStrict(item.timestamp, { addSuffix: true })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
                 {/* Optional Footer */}
            </Card>
         </>
       ) : (
          // Message when properties exist but none is selected (Original Structure)
          <div className="text-center py-16 md:py-24 px-6">
              <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md border border-gray-200">
                 <h2 className="text-xl font-semibold text-gray-800 mb-3 font-poppins">Select a Property</h2>
                <p className="text-gray-600">Please choose a property from the list in the sidebar.</p>
            </div>
          </div>
       )}
    </div> // This closing div matches the outer div
  );
}; // This closing brace matches the component function

export default Dashboard; // Original export