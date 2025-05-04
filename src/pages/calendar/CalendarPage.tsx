// src/pages/calendar/CalendarPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, SlotInfo } from 'react-big-calendar';
// CORRECTED: Use named import for enUS
import { format, parse, startOfWeek, getDay, addDays, differenceInDays, startOfDay, endOfDay, isSameDay, isWithinInterval, eachDayOfInterval, isValid as isDateValid } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US'; // Named import
import 'react-big-calendar/lib/css/react-big-calendar.css';
// CORRECTED: Use useBooking hook name
import { useBooking } from '@/contexts/BookingContext';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { Booking, BookingEvent, MaintenanceTask, Profile } from '@/integrations/supabase/types';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from "@/components/ui/textarea";
import { Label } from '@/components/ui/label';
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn, getInitials } from '@/lib/utils';
import { CalendarIcon, Loader2, AlertCircle, Users, Edit, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// CORRECTED: Use named import for BookingDetailSheet
import { BookingDetailSheet } from '@/components/calendar/BookingDetailSheet';
import { DateRange } from 'react-day-picker';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const locales = { 'en-US': enUS, };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales, });

// --- Calendar Page Component ---
const CalendarPage: React.FC = () => {
    const { user } = useAuth();
    const { selectedProperty, propertyMembers } = useProperty();
    // CORRECTED: Use useBooking hook
    const { bookings, isLoading: bookingsLoading, error: bookingsError, addBooking, updateBooking, getBookingById } = useBooking();
    const { tasks: maintenanceTasks, isLoading: maintenanceLoading, error: maintenanceError } = useMaintenance();
    const { toast } = useToast();

    // State remains the same
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [numGuests, setNumGuests] = useState<number>(1);
    const [purpose, setPurpose] = useState<string>('');
    const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

    // Callbacks and Memos remain the same logic, but use corrected hook results
    const maintenanceBlockingRanges = useMemo(() => {
        return (maintenanceTasks ?? [])
            .filter(task => task.blocks_booking && task.scheduled_date_start && task.scheduled_date_end)
            .map(task => ({
                start: startOfDay(new Date(task.scheduled_date_start!)),
                end: endOfDay(new Date(task.scheduled_date_end!)),
                title: `Maintenance: ${task.title}`,
                type: 'maintenance' as const
            }));
    }, [maintenanceTasks]);

    const bookingBlockingRanges = useMemo(() => {
        return (bookings ?? [])
             .filter(booking => (booking.status === 'confirmed' || booking.status === 'approved') && booking.id !== editingBookingId)
             .map(booking => ({
                start: startOfDay(new Date(booking.start_date)),
                end: endOfDay(new Date(booking.end_date)),
                title: `Booked${booking.profile ? `: ${booking.profile.first_name}` : ''}`,
                type: 'booking' as const
            }));
    }, [bookings, editingBookingId]);

    const allBlockingRanges = useMemo(() => [
        ...maintenanceBlockingRanges,
        ...bookingBlockingRanges
    ], [maintenanceBlockingRanges, bookingBlockingRanges]);

    const isDateDisabled = useCallback((date: Date): boolean => {
        const today = startOfDay(new Date());
        if (date < today) return true;
        return allBlockingRanges.some(range =>
             isWithinInterval(date, { start: range.start, end: range.end })
         );
    }, [allBlockingRanges]);

    const events = useMemo<BookingEvent[]>(() => {
        return bookings.map(booking => ({
            id: booking.id,
            title: `${booking.profile?.first_name ?? 'User'} (${booking.num_guests}) ${booking.status === 'pending' ? '⏳' : ''}`,
            start: new Date(booking.start_date),
            end: addDays(new Date(booking.end_date), 1),
            allDay: true,
            resource: booking,
        }));
    }, [bookings]);

    const eventStyleGetter = useCallback((event: BookingEvent, start: Date, end: Date, isSelected: boolean) => {
        let backgroundColor = '#3174ad';
        if (event.resource?.purpose?.toLowerCase().includes('owner')) backgroundColor = '#f0ad4e';
        else if (event.resource?.purpose?.toLowerCase().includes('guest')) backgroundColor = '#5bc0de';
        else if (event.resource?.purpose?.toLowerCase().includes('maintenance')) backgroundColor = '#777';
        if (event.resource?.status === 'pending') backgroundColor = '#d9534f';
        const style: React.CSSProperties = {
            backgroundColor, borderRadius: '5px', opacity: 0.8, color: 'white', border: '0px', display: 'block', fontSize: '0.8em', padding: '2px 5px',
        };
        return { style };
    }, []);

    const resetDialogForm = () => {
        setStartDate(undefined); setEndDate(undefined); setDateRange(undefined);
        setNumGuests(1); setPurpose(''); setEditingBookingId(null); setDialogMode('add');
    }

    const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
        if (!user) return;
        const datesInSlot = eachDayOfInterval({ start: slotInfo.start, end: addDays(slotInfo.end, -1) });
        if (datesInSlot.some(d => isDateDisabled(d))) {
            toast({ title: "Blocked Dates Selected", description: "The selected date range includes blocked maintenance or booking dates.", variant: "destructive" });
            return;
        }
        resetDialogForm();
        const start = startOfDay(slotInfo.start);
        const end = startOfDay(slotInfo.end);
        const adjustedEnd = isSameDay(start, end) ? start : startOfDay(addDays(end, -1));
        setStartDate(start); setEndDate(adjustedEnd); setDateRange({ from: start, to: adjustedEnd });
        setDialogMode('add'); setIsDialogOpen(true);
    }, [user, isDateDisabled, toast]);

    const handleSelectEvent = useCallback((event: BookingEvent) => {
        setSelectedBooking(event.resource); setIsSheetOpen(true);
    }, []);

    const handleDateSelect = (range: DateRange | undefined) => {
        if (range?.from) setStartDate(startOfDay(range.from)); else setStartDate(undefined);
        if (range?.to) setEndDate(startOfDay(range.to)); else setEndDate(undefined);
        setDateRange(range); setPopoverOpen(false);
    };

    const handleOpenEditDialog = useCallback((booking: Booking) => {
         if (!booking) return;
         resetDialogForm(); setEditingBookingId(booking.id); setDialogMode('edit');
         const start = startOfDay(new Date(booking.start_date));
         const end = startOfDay(new Date(booking.end_date));
         setStartDate(start); setEndDate(end); setDateRange({ from: start, to: end });
         setNumGuests(booking.num_guests || 1); setPurpose(booking.purpose || '');
         setIsSheetOpen(false); setIsDialogOpen(true);
    }, []);

    const handleSubmit = async () => {
        if (!user || !selectedProperty || !startDate || !endDate) return;
        if (eachDayOfInterval({ start: startDate, end: endDate }).some(d => isDateDisabled(d))) {
             toast({ title: "Blocked Dates Selected", description: "Cannot save booking overlapping blocked dates.", variant: "destructive" }); return;
        }
        setIsSaving(true);
        const bookingData = {
            start_date: format(startDate, 'yyyy-MM-dd'), end_date: format(endDate, 'yyyy-MM-dd'),
            num_guests: numGuests, purpose: purpose.trim() || null,
        };
        let result;
        try {
            if (dialogMode === 'edit' && editingBookingId) result = await updateBooking(editingBookingId, bookingData);
            else result = await addBooking(bookingData);
            if (result.error) throw result.error;
            toast({ title: `Booking ${dialogMode === 'edit' ? 'Updated' : 'Requested'}`, description: `Your booking from ${format(startDate, 'PP')} to ${format(endDate, 'PP')} has been ${dialogMode === 'edit' ? 'updated' : 'submitted'}.` });
            setIsDialogOpen(false); resetDialogForm();
        } catch (err: any) {
            console.error(`Error ${dialogMode === 'edit' ? 'updating' : 'adding'} booking:`, err);
            toast({ title: `Error ${dialogMode === 'edit' ? 'Updating' : 'Requesting'} Booking`, description: err.message || "An unexpected error occurred.", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const usageDaysPerMember = useMemo(() => {
        const usageMap: Record<string, number> = {};
        if (!propertyMembers) return usageMap;
        propertyMembers.forEach(member => { if(member.user_id) usageMap[member.user_id] = 0; });
        bookings.forEach(booking => {
            if (booking.status === 'confirmed' || booking.status === 'approved') {
                 const start = startOfDay(new Date(booking.start_date)); const end = startOfDay(new Date(booking.end_date));
                 const duration = differenceInDays(end, start) + 1;
                 if (booking.user_id && usageMap.hasOwnProperty(booking.user_id)) usageMap[booking.user_id] += duration;
            }
        });
        return usageMap;
    }, [bookings, propertyMembers]);

    const memberUsageList = useMemo(() => {
        if (!propertyMembers) return [];
        return propertyMembers.map(member => ({ member, days: usageDaysPerMember[member.user_id] || 0 })).sort((a, b) => b.days - a.days);
    }, [propertyMembers, usageDaysPerMember]);

    const isLoading = bookingsLoading || maintenanceLoading;
    const error = bookingsError || maintenanceError;

    if (error) return <div className="p-4 text-red-600">Error loading data: {error.message}</div>;

    // --- Render Component ---
    return (
        <div className="p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold tracking-tight">Booking Calendar</h1>
                    <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!open) resetDialogForm(); setIsDialogOpen(open); }}>
                        <DialogTrigger asChild>
                            <Button disabled={!selectedProperty || isLoading}>Request Booking</Button>
                        </DialogTrigger>
                         <DialogContent className="sm:max-w-[425px] md:max-w-[600px]">
                             <DialogHeader>
                                <DialogTitle>{dialogMode === 'edit' ? 'Edit Booking' : 'Request New Booking'}</DialogTitle>
                                <DialogDescription>Select your dates and provide booking details. Click save when you're done.</DialogDescription>
                             </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="date-range" className="text-right">Dates</Label>
                                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button id="date-range" variant={"outline"} className={cn("w-[300px] justify-start text-left font-normal col-span-3", !dateRange && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <ShadcnCalendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={handleDateSelect} numberOfMonths={2} disabled={isDateDisabled}/>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="num-guests" className="text-right">Guests</Label>
                                    <Input id="num-guests" type="number" min="1" value={numGuests} onChange={(e) => setNumGuests(Math.max(1, parseInt(e.target.value) || 1))} className="col-span-3"/>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="purpose" className="text-right">Purpose <span className="text-xs text-muted-foreground">(Optional)</span></Label>
                                    <Textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="col-span-3" placeholder="e.g., Owner Use, Guest Visit, Family Vacation"/>
                                </div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline" onClick={resetDialogForm}>Cancel</Button></DialogClose>
                                <Button type="button" onClick={handleSubmit} disabled={isSaving || !startDate || !endDate}>
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {dialogMode === 'edit' ? 'Save Changes' : 'Submit Request'}
                                </Button>
                            </DialogFooter>
                         </DialogContent>
                     </Dialog>
                 </div>
                {isLoading && <div className="flex justify-center items-center h-[500px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
                {!isLoading && (
                     <Calendar
                         localizer={localizer}
                         events={events}
                         startAccessor="start"
                         endAccessor="end"
                         style={{ height: 600 }}
                         selectable
                         onSelectSlot={handleSelectSlot}
                         onSelectEvent={handleSelectEvent}
                         eventPropGetter={eventStyleGetter}
                         views={['month', 'week', 'day']}
                         step={60}
                         showMultiDayTimes
                         popup
                         // CORRECTED: Removed invalid prop
                         // showCurrentTimeIndicator={true}
                         tooltipAccessor={(event: BookingEvent) => `${event.resource.profile?.first_name ?? 'User'}: ${event.resource.purpose || 'Booking'} (${format(event.start, 'PP')} - ${format(addDays(event.end, -1), 'PP')})`}
                         slotPropGetter={(date) => {
                            if (date < startOfDay(new Date())) return { className: 'rbc-past-slot', style: { backgroundColor: '#f8f9fa' }, };
                            if (isDateDisabled(date)) return { style: { backgroundColor: 'rgba(220, 53, 69, 0.1)' }, };
                            return {};
                         }}
                    />
                 )}
             </div>

             {/* Sidebar Area */}
             <div className="lg:col-span-1 space-y-6">
                 <Card>
                     <CardHeader><CardTitle>Usage Tracker</CardTitle></CardHeader>
                     <CardContent>
                         {propertyMembers && propertyMembers.length > 0 ? (
                             <ul className="space-y-3">
                                 {memberUsageList.map(({ member, days }) => (
                                      member.profile && (
                                         <li key={member.user_id} className="flex items-center justify-between text-sm">
                                             <div className="flex items-center gap-2">
                                                 <Avatar className="h-7 w-7">
                                                     <AvatarImage src={member.profile.avatar_url ?? undefined} />
                                                     <AvatarFallback className="text-xs">{getInitials(`${member.profile.first_name} ${member.profile.last_name}`)}</AvatarFallback>
                                                 </Avatar>
                                                 <span className="truncate" title={`${member.profile.first_name} ${member.profile.last_name}`}>{member.profile.first_name}</span>
                                             </div>
                                             <span className="font-medium">{days} day{days === 1 ? '' : 's'}</span>
                                         </li>
                                     )
                                 ))}
                             </ul>
                         ) : ( <p className="text-sm text-muted-foreground">No members found for this property.</p> )}
                     </CardContent>
                 </Card>
             </div>

            {/* Detail Sheet */}
             <BookingDetailSheet
                isOpen={isSheetOpen}
                onOpenChange={setIsSheetOpen}
                booking={selectedBooking}
                onEdit={handleOpenEditDialog}
             />
        </div>
    );
};

export default CalendarPage;