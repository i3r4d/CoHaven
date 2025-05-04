// src/components/maintenance/EditTaskDialog.tsx
// v19 - Fix form pre-population issue.
//   - Added explicit defaultValues to useForm matching the schema.
//   - Corrected and detailed the form.reset() call within useEffect
//     to ensure all fields are mapped correctly from the task prop,
//     including date parsing (safeParseISO) and null handling.
//   - Mapped DB field `completed_at` to form field `completed_date`.

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    format,
    parseISO,
    areIntervalsOverlapping,
    startOfDay,
    endOfDay,
    isValid,
    isBefore,
} from 'date-fns'; // Ensure all needed functions are here

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label"; // Keep Label import
import { useToast } from '@/hooks/use-toast';
import { useProperty } from '@/contexts/PropertyContext';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { MaintenanceTask, TablesUpdate, BookingRow, Profile, MaintenanceStatus, MaintenancePriority, PropertyMemberWithProfile } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// --- Schema Definition ---
const taskFormSchema = z.object({
    title: z.string().min(1, "Title is required.").max(100),
    // Make description optional in Zod to match Textarea behavior, but required in DB (handle in submit)
    // Or keep required and ensure reset/default provides empty string
    description: z.string().max(500, "Description max 500 chars.").default(''),
    priority: z.nativeEnum(MaintenancePriority),
    status: z.nativeEnum(MaintenanceStatus),
    assignee_id: z.string().uuid().nullable().optional(),
    vendor_name: z.string().max(100).nullable().optional(),
    vendor_contact: z.string().max(100).nullable().optional(),
    estimated_cost: z.number().positive().nullable().optional(),
    scheduled_date_start: z.date().nullable().optional(),
    scheduled_date_end: z.date().nullable().optional(),
    // Form field name is completed_date, maps to DB completed_at
    completed_date: z.date().nullable().optional(),
    blocks_booking: z.boolean().default(false),
}).refine(data => {
    if (data.scheduled_date_start && data.scheduled_date_end) {
        return !isBefore(data.scheduled_date_end, data.scheduled_date_start);
    }
    return true;
}, {
    message: "Scheduled end date cannot be before the start date.",
    path: ["scheduled_date_end"],
})
.refine(data => {
    if (data.status === MaintenanceStatus.Completed && !data.completed_date) {
        return false; // Completed tasks must have a completion date
    }
    return true;
}, {
    message: "Completion date is required when status is 'Completed'.",
    path: ["completed_date"],
});

// --- Types/Interfaces ---
interface EditTaskDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    task: MaintenanceTask | null; // The task to edit
}
const FINALIZED_BOOKING_STATUSES = ['confirmed', 'completed'];
type BookingWithProfileInfo = BookingRow & { profiles: Pick<Profile, 'id' | 'first_name' | 'last_name'> | null; };
type EditFormDataType = z.infer<typeof taskFormSchema>;

export const EditTaskDialog: React.FC<EditTaskDialogProps> = ({ isOpen, onOpenChange, task }) => {
    const { toast } = useToast();
    const { selectedProperty, propertyMembers } = useProperty();
    const { updateTask } = useMaintenance();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [conflictingBookings, setConflictingBookings] = useState<BookingWithProfileInfo[]>([]);

    // Memoize unique assignees (ensure propertyMembers exists)
    const uniqueAssigneeMembers = useMemo(() => {
        if (!propertyMembers) return [];
        const uniqueMembers = new Map<string, PropertyMemberWithProfile>();
        propertyMembers.forEach(member => {
            if (member.user_id && !uniqueMembers.has(member.user_id)) {
                uniqueMembers.set(member.user_id, member);
            }
        });
        return Array.from(uniqueMembers.values());
    }, [propertyMembers]);

    // Safe Date Parser
    const safeParseISO = (dateString: string | null | undefined, fieldName: string): Date | null => {
        if (!dateString) return null;
        try {
            const parsedDate = parseISO(dateString);
            if (isValid(parsedDate)) {
                return parsedDate;
            } else {
                console.warn(`safeParseISO: Invalid date string encountered for field '${fieldName}':`, dateString);
                return null;
            }
        } catch (error) {
            console.error(`safeParseISO: Error parsing date string for field '${fieldName}':`, dateString, error);
            return null;
        }
    };

    // --- Form Initialization with Explicit Defaults ---
    const form = useForm<EditFormDataType>({
        resolver: zodResolver(taskFormSchema),
        defaultValues: {
            title: '',
            description: '', // Ensure default is empty string
            priority: MaintenancePriority.Medium, // Sensible default
            status: MaintenanceStatus.Pending,     // Sensible default
            assignee_id: null,
            vendor_name: null,
            vendor_contact: null,
            estimated_cost: null,
            scheduled_date_start: null,
            scheduled_date_end: null,
            completed_date: null, // Default for form field
            blocks_booking: false,
        }
    });

    // --- Effect to reset form when task data changes ---
    useEffect(() => {
        // Only reset if the dialog is open and we have a task object
        if (isOpen && task) {
            console.log("EditTaskDialog: Resetting form with task:", task); // Log the task being used

            const resetData = {
                title: task.title || '',
                // Ensure description is never null for reset, use empty string if needed
                description: task.description || '', // DB has NOT NULL constraint
                priority: task.priority || MaintenancePriority.Medium,
                status: task.status || MaintenanceStatus.Pending,
                // Use null for optional FKs/strings if task property is null/undefined
                assignee_id: task.assignee_id || null,
                vendor_name: task.vendor_name || null,
                vendor_contact: task.vendor_contact || null,
                // Use null for optional numbers if task property is null/undefined
                estimated_cost: task.estimated_cost === undefined ? null : task.estimated_cost,
                // Parse dates safely, defaulting to null if parsing fails or source is null
                scheduled_date_start: safeParseISO(task.scheduled_date_start, 'scheduled_date_start'),
                scheduled_date_end: safeParseISO(task.scheduled_date_end, 'scheduled_date_end'),
                // *** Map completed_at from DB to completed_date for the form ***
                completed_date: safeParseISO(task.completed_at, 'completed_at'), // Source is task.completed_at
                blocks_booking: task.blocks_booking || false,
            };

            console.log("EditTaskDialog: Data being passed to form.reset:", resetData); // Log the data before resetting
            form.reset(resetData);
        }
         // Don't reset if dialog is closed, prevents flicker on close
         // Reset occurs when isOpen becomes true AND task is present
         // Or when task changes while isOpen is true
    }, [isOpen, task, form.reset]); // Use form.reset in dep array as it's stable


    // Effect to check conflicts (Two-query approach - unchanged)
    useEffect(() => {
        const checkConflicts = async () => {
            if (!selectedProperty?.id || !isOpen) {
                setConflictingBookings([]); // Clear conflicts if property changes or dialog closes
                return;
            }

            const { scheduled_date_start, scheduled_date_end, blocks_booking } = form.getValues();

            if (!blocks_booking || !scheduled_date_start) {
                 setConflictingBookings([]); // No blocking or no start date, no conflicts
                return;
            }

             // If only start date is set, consider it a single day block for checking
            const maintenanceEnd = scheduled_date_end ? endOfDay(scheduled_date_end) : endOfDay(scheduled_date_start);
            const maintenanceStart = startOfDay(scheduled_date_start);

            // Fetch potentially conflicting bookings (approved/confirmed)
             const { data: bookingsData, error: bookingsError } = await supabase
                .from('bookings')
                .select('id, user_id, start_date, end_date, status')
                .eq('property_id', selectedProperty.id)
                .in('status', FINALIZED_BOOKING_STATUSES)
                .or(`start_date.lte.${maintenanceEnd.toISOString()},end_date.gte.${maintenanceStart.toISOString()}`); // Overlapping condition

            if (bookingsError) {
                console.error("Error fetching bookings for conflict check:", bookingsError);
                toast({ title: "Conflict Check Error", description: "Could not fetch bookings.", variant: "destructive" });
                setConflictingBookings([]);
                return;
            }

            if (!bookingsData || bookingsData.length === 0) {
                 setConflictingBookings([]); // No bookings fetched, no conflicts
                return;
            }

             // Filter for actual overlaps and fetch profile info
            const overlappingBookingIds: string[] = [];
            const potentiallyOverlappingBookings = bookingsData.filter(booking => {
                const bookingStart = startOfDay(parseISO(booking.start_date));
                const bookingEnd = endOfDay(parseISO(booking.end_date));
                const overlaps = areIntervalsOverlapping(
                    { start: maintenanceStart, end: maintenanceEnd },
                    { start: bookingStart, end: bookingEnd },
                    { inclusive: true } // Consider edges as overlapping
                );
                if (overlaps) {
                    overlappingBookingIds.push(booking.id); // Collect IDs for profile fetch
                }
                return overlaps;
            });

            if (potentiallyOverlappingBookings.length === 0) {
                setConflictingBookings([]); // No actual overlaps found
                return;
            }

            // Fetch profiles for conflicting bookings
            const userIds = potentiallyOverlappingBookings.map(b => b.user_id).filter((id): id is string => !!id);
            let profilesMap: Map<string, Pick<Profile, 'id' | 'first_name' | 'last_name'>> = new Map();

            if (userIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name')
                    .in('id', userIds);

                if (profilesError) {
                    console.error("Error fetching profiles for conflicting bookings:", profilesError);
                    // Proceed without profile info, show basic conflict
                } else if (profilesData) {
                    profilesData.forEach(p => profilesMap.set(p.id, p));
                }
            }

            // Combine booking data with profile info
            const bookingsWithInfo: BookingWithProfileInfo[] = potentiallyOverlappingBookings.map(booking => ({
                ...booking,
                profiles: booking.user_id ? profilesMap.get(booking.user_id) ?? null : null
            }));


            setConflictingBookings(bookingsWithInfo);
            console.log("Conflict check completed. Conflicts found:", bookingsWithInfo);
        };

        // Watch relevant form fields to re-trigger the check
        const subscription = form.watch((value, { name, type }) => {
            if (name === 'scheduled_date_start' || name === 'scheduled_date_end' || name === 'blocks_booking') {
                checkConflicts();
            }
        });

        // Run check initially when dialog opens and relevant fields might be pre-filled
        if (isOpen) {
             checkConflicts();
        }

        return () => subscription.unsubscribe();

    }, [form, selectedProperty?.id, isOpen, toast]); // Dependencies for conflict check

    // onSubmit handler
    const onSubmit = async (values: EditFormDataType) => {
        if (!task || !selectedProperty) {
            toast({ title: "Error", description: "Missing task or property context.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        console.log("Form submitted with values:", values); // Log submitted data

        // Prepare data for Supabase (ensure correct types and nulls)
        const updateData: TablesUpdate<'maintenance_tasks'> = {
            title: values.title,
            // Ensure description is not null if DB requires it, otherwise allow null/empty based on schema/DB
            description: values.description || 'N/A', // Provide default if empty and DB needs NOT NULL
            priority: values.priority,
            status: values.status,
            assignee_id: values.assignee_id || null, // Ensure null if undefined/empty string
            vendor_name: values.vendor_name || null,
            vendor_contact: values.vendor_contact || null,
            // Ensure null if undefined/empty string/0, DB expects positive or null
             estimated_cost: values.estimated_cost ? Number(values.estimated_cost) : null,
             // Format dates back to ISO strings for Supabase, handle nulls
            scheduled_date_start: values.scheduled_date_start ? values.scheduled_date_start.toISOString() : null,
            scheduled_date_end: values.scheduled_date_end ? values.scheduled_date_end.toISOString() : null,
             // *** Map completed_date from form back to completed_at for DB ***
            completed_at: values.completed_date ? values.completed_date.toISOString() : null,
            blocks_booking: values.blocks_booking,
            // property_id is implicit via RLS or context fetch, ensure task ID is passed
        };

        console.log("Data prepared for Supabase update:", updateData); // Log data before sending

        const result = await updateTask(task.id, updateData);

        setIsSubmitting(false);
        if (result.error) {
            toast({ title: "Update Failed", description: result.error.message, variant: "destructive" });
            console.error("Supabase update error:", result.error);
        } else {
            toast({ title: "Task Updated", description: `"${values.title}" has been updated.` });
            onOpenChange(false); // Close dialog on success
        }
    };

    // Handle assignee change to set null correctly
     const handleAssigneeChange = (value: string) => {
        // If the special "unassigned" value is selected, set form value to null
        // Otherwise, use the selected user_id (which is a UUID string)
        form.setValue('assignee_id', value === 'unassigned' ? null : value, { shouldDirty: true });
     };


    // Handle loading/missing task states
    if (!isOpen) return null; // Don't render anything if not open
    // Show loading only if open but task hasn't arrived yet
    if (isOpen && !task) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent>
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading task details...
                    </div>
                </DialogContent>
            </Dialog>
        );
    }
    // If task is somehow null even after loading check (shouldn't happen if logic is right)
    if (!task) return null;


    // --- Component Return JSX (Structure Unchanged) ---
    return (
        // Dialog structure remains the same
        <Dialog open={isOpen} onOpenChange={(open) => { if (!isSubmitting) onOpenChange(open); }}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                 {/* Header using task data */}
                 <DialogHeader> <DialogTitle>Edit Maintenance Task</DialogTitle> <DialogDescription> Update task: "{task.title}" for {selectedProperty?.name || 'N/A'}. </DialogDescription> </DialogHeader>
                 {/* Form */}
                <Form {...form}>
                     {/* onSubmit uses form.handleSubmit */}
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
                        {/* Title */}
                        <FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} placeholder="e.g., Fix leaky faucet in main bathroom" /></FormControl><FormMessage /></FormItem> )}/>

                        {/* Description */}
                        <FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} placeholder="Add details about the task..." /></FormControl><FormMessage /></FormItem> )}/>

                        {/* Priority & Status */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="priority" render={({ field }) => ( <FormItem><FormLabel>Priority *</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger></FormControl><SelectContent>{Object.values(MaintenancePriority).map(p => (<SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )}/>
                            <FormField control={form.control} name="status" render={({ field }) => ( <FormItem><FormLabel>Status *</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl><SelectContent>{Object.values(MaintenanceStatus).map(s => (<SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )}/>
                        </div>

                         {/* Assignee */}
                        <FormField
                            control={form.control}
                            name="assignee_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Assignee</FormLabel>
                                    {/* Use handleAssigneeChange for onValueChange */}
                                    {/* Value needs to handle null correctly. If field.value is null, use 'unassigned' for the Select's state */}
                                    <Select
                                        onValueChange={handleAssigneeChange}
                                        value={field.value ?? 'unassigned'}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select assignee" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="unassigned">-- Unassigned --</SelectItem>
                                            {/* Added check for uniqueAssigneeMembers being an array */}
                                            {Array.isArray(uniqueAssigneeMembers) && uniqueAssigneeMembers.map(pm => (
                                                <SelectItem key={pm.user_id} value={pm.user_id}>
                                                    {/* Ensure profile exists before accessing its properties */}
                                                    {`${pm.profile?.first_name || ''} ${pm.profile?.last_name || ''} (${pm.profile?.email || 'No email'})`.trim()}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Vendor Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="vendor_name" render={({ field }) => ( <FormItem><FormLabel>Vendor Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Optional vendor name" /></FormControl><FormMessage /></FormItem> )}/>
                            <FormField control={form.control} name="vendor_contact" render={({ field }) => ( <FormItem><FormLabel>Vendor Contact</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Optional phone/email" /></FormControl><FormMessage /></FormItem> )}/>
                        </div>

                        {/* Costs (Estimated Only) */}
                        <div className="grid grid-cols-1 gap-4">
                            <FormField
                                control={form.control}
                                name="estimated_cost"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Estimated Cost ($)</FormLabel>
                                        <FormControl>
                                            {/* Handle number input carefully, allow empty string but submit null */}
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0" // Prevent negative numbers directly in input
                                                {...field}
                                                value={field.value ?? ''} // Display empty string if null/undefined
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    // Allow empty string, otherwise parse as float
                                                    const num = val === '' ? null : parseFloat(val);
                                                    // Update only if null or a valid non-negative number
                                                    if (num === null || (!isNaN(num) && num >= 0)) {
                                                        field.onChange(num);
                                                    }
                                                }}
                                                placeholder="e.g., 150.00"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Dates */}
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             {/* Scheduled Start */}
                            <FormField control={form.control} name="scheduled_date_start" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Scheduled Start</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><span className="flex items-center justify-between w-full">{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-2 h-4 w-4 opacity-50" /></span></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value ?? undefined} onSelect={(date) => field.onChange(date ?? null)} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
                             {/* Scheduled End */}
                            <FormField control={form.control} name="scheduled_date_end" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Scheduled End</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")} disabled={!form.watch('scheduled_date_start')}><span className="flex items-center justify-between w-full">{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-2 h-4 w-4 opacity-50" /></span></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value ?? undefined} onSelect={(date) => field.onChange(date ?? null)} disabled={(date) => { const startDate = form.getValues("scheduled_date_start"); return startDate ? date < startOfDay(startDate) : false; }} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
                             {/* Completed Date (mapped from completed_at) */}
                            <FormField control={form.control} name="completed_date" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Completed Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><span className="flex items-center justify-between w-full">{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-2 h-4 w-4 opacity-50" /></span></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value ?? undefined} onSelect={(date) => field.onChange(date ?? null)} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
                        </div>

                        {/* Blocks Booking */}
                        <FormField control={form.control} name="blocks_booking" render={({ field }) => ( <FormItem className={cn("flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm", form.getFieldState('blocks_booking', form.formState).error && "border-destructive" )}> <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="blocks_booking" aria-describedby="blocks-booking-description" /></FormControl> <div className="space-y-1 leading-none"> <Label htmlFor="blocks_booking" className="font-medium cursor-pointer">Block Bookings during scheduled dates</Label> <FormDescription id="blocks-booking-description"> If checked, prevents new bookings from overlapping with the scheduled start/end dates. </FormDescription> <FormMessage /> </div> </FormItem> )}/>

                        {/* Conflicting Bookings Warning */}
                         {conflictingBookings.length > 0 && ( <div className="p-3 border border-destructive bg-destructive/10 rounded-md text-destructive text-sm"> <p className="font-semibold">Warning: This schedule conflicts with existing bookings:</p> <ul className="list-disc list-inside mt-1"> {conflictingBookings.map(booking => ( <li key={booking.id}> Booking {format(parseISO(booking.start_date), 'PP')} - {format(parseISO(booking.end_date), 'PP')} {booking.profiles ? ` by ${booking.profiles.first_name} ${booking.profiles.last_name}` : ''} (Status: {booking.status}) </li> ))} </ul> </div> )}

                        {/* Footer with Submit/Cancel */}
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}> Cancel </Button>
                            <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};