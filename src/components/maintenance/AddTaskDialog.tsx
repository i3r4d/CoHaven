// src/components/maintenance/AddTaskDialog.tsx
// v9 - Add console logs to debug unresponsive submit button.
//    - Added log inside the custom onSubmit function.
//    - Added log inside the <form> onSubmit prop handler.
//    - Based on v8 structure (manual form, no asChild, useMemo fix).

import React, { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    format, parseISO, areIntervalsOverlapping, startOfDay, endOfDay, isValid, isBefore
} from 'date-fns';

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { useProperty } from '@/contexts/PropertyContext';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { MaintenanceTaskFormData, TablesInsert, BookingRow, Profile, MaintenanceStatus, MaintenancePriority, PropertyMemberWithProfile } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Schema definition
const taskFormSchema = z.object({
    title: z.string().min(3, { message: "Title must be at least 3 characters long." }),
    description: z.string().optional().nullable(),
    status: z.nativeEnum(MaintenanceStatus),
    priority: z.nativeEnum(MaintenancePriority),
    assignee_id: z.string().uuid().nullable().optional(),
    vendor_name: z.string().optional().nullable(),
    vendor_contact: z.string().optional().nullable(),
    scheduled_date_start: z.date().optional().nullable(),
    scheduled_date_end: z.date().optional().nullable(),
    estimated_cost: z.preprocess(
            (val) => (val === "" ? null : val),
            z.number().positive("Estimated cost must be positive.").optional().nullable()
        ).optional().nullable(),
    blocks_booking: z.boolean(),
}).refine(data => {
    if (data.scheduled_date_start && data.scheduled_date_end) {
        return !isBefore(startOfDay(data.scheduled_date_end), startOfDay(data.scheduled_date_start));
    }
    return true;
}, { message: "End date cannot be before start date", path: ["scheduled_date_end"] });


interface AddTaskDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
}

const FINALIZED_BOOKING_STATUSES = ['confirmed', 'completed'];

const FieldError = ({ message }: { message?: string }) => {
    if (!message) return null;
    return <p className="text-sm font-medium text-destructive mt-1">{message}</p>;
};

export const AddTaskDialog: React.FC<AddTaskDialogProps> = ({ isOpen, onOpenChange }) => {
    const { toast } = useToast();
    const { selectedProperty, propertyMembers } = useProperty();
    const { addTask } = useMaintenance();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<MaintenanceTaskFormData>({
        resolver: zodResolver(taskFormSchema),
        defaultValues: {
            title: '', description: null, status: MaintenanceStatus.Pending, priority: MaintenancePriority.Medium,
            assignee_id: null, vendor_name: null, vendor_contact: null, scheduled_date_start: null,
            scheduled_date_end: null, estimated_cost: null, blocks_booking: false,
        },
    });
    const { register, handleSubmit, control, formState: { errors }, setValue, watch, getValues, setError: setFormError } = form;

    const uniqueAssigneeMembers = useMemo(() => {
        if (!Array.isArray(propertyMembers)) {
            console.warn("AddTaskDialog: propertyMembers is not an array, returning empty for uniqueAssigneeMembers.");
            return [];
        }
        const uniqueMembers = new Map<string, PropertyMemberWithProfile>();
        propertyMembers.forEach(member => {
            if (member.user_id && member.profile && !uniqueMembers.has(member.user_id)) {
                uniqueMembers.set(member.user_id, member);
            }
        });
        return Array.from(uniqueMembers.values()).sort((a, b) => {
            const nameA = `${a.profile?.first_name || ''} ${a.profile?.last_name || ''}`.trim().toLowerCase();
            const nameB = `${b.profile?.first_name || ''} ${b.profile?.last_name || ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [propertyMembers]);

    useEffect(() => {
        if (!isOpen) {
            form.reset();
            setIsSubmitting(false);
        }
    }, [isOpen, form]);

    // --- Add Log to onSubmit ---
    const onSubmit = async (values: MaintenanceTaskFormData) => {
        console.log("AddTaskDialog: Custom onSubmit function CALLED with values:", values); // <-- ADDED THIS LOG
        if (!selectedProperty || !addTask) {
            toast({ title: "Error", description: "Cannot add task: No property selected or context unavailable.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);

        // --- CONFLICT CHECK LOGIC ---
        if (values.blocks_booking && values.scheduled_date_start) {
             const maintenanceStart = startOfDay(values.scheduled_date_start);
             const maintenanceEnd = values.scheduled_date_end ? endOfDay(values.scheduled_date_end) : endOfDay(maintenanceStart);

             if (!isValid(maintenanceStart) || !isValid(maintenanceEnd)) {
                 toast({ title: "Invalid Dates", description: "Scheduled dates are invalid.", variant: "destructive"});
                 setIsSubmitting(false);
                 return;
             }
             console.log("Checking for booking conflicts for maintenance:", maintenanceStart, maintenanceEnd);
             try {
                 const { data: bookingsData, error: bookingsError } = await supabase.from('bookings').select('id, start_date, end_date, user_id, status').eq('property_id', selectedProperty.id).in('status', FINALIZED_BOOKING_STATUSES);
                 if (bookingsError) throw bookingsError;
                 const bookings = bookingsData || [];

                 if (bookings.length > 0) {
                     const userIds = [...new Set(bookings.map(b => b.user_id).filter(id => !!id))];
                     let profileMap = new Map<string, Pick<Profile, 'id' | 'first_name' | 'last_name'>>();
                     if (userIds.length > 0) {
                        const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds);
                        if (profilesError) { console.warn("Could not fetch profiles for conflict check:", profilesError); }
                        else { (profilesData || []).forEach(p => profileMap.set(p.id, p)); }
                     }

                    const conflictingBooking = bookings.find(booking => {
                         try {
                            if (!booking.start_date || !booking.end_date) return false;
                            const bookingStart = startOfDay(parseISO(booking.start_date));
                            const bookingEnd = endOfDay(parseISO(booking.end_date));
                            if (!isValid(bookingStart) || !isValid(bookingEnd) || !isValid(maintenanceStart) || !isValid(maintenanceEnd)) return false;
                             return areIntervalsOverlapping( { start: maintenanceStart, end: maintenanceEnd }, { start: bookingStart, end: bookingEnd }, { inclusive: true });
                         } catch (parseError) { console.error("Error parsing booking dates during conflict check:", booking, parseError); return false; }
                     });

                     if (conflictingBooking) {
                         const profileInfo = conflictingBooking.user_id ? profileMap.get(conflictingBooking.user_id) : null;
                         const bookerName = profileInfo ? `${profileInfo.first_name || ''} ${profileInfo.last_name || 'User'}`.trim() : 'Someone';
                         const conflictMsg = `Conflicts with ${bookerName}'s booking (${format(parseISO(conflictingBooking.start_date!), 'PP')} - ${format(parseISO(conflictingBooking.end_date!), 'PP')}).`;
                         setFormError("scheduled_date_start", { type: "manual", message: conflictMsg });
                         setFormError("blocks_booking", { type: "manual", message: "Date conflict." });
                         toast({ title: "Scheduling Conflict", description: conflictMsg, variant: "destructive", duration: 7000 });
                         setIsSubmitting(false);
                         return;
                     }
                 }
             } catch (error: any) {
                console.error("Error checking for booking conflicts:", error);
                toast({ title: "Conflict Check Error", description: "Could not verify booking conflicts. Please try again.", variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
         }
        // --- END CONFLICT CHECK LOGIC ---

        // Prepare data for the addTask function
        const taskDataToInsert: Omit<TablesInsert<'maintenance_tasks'>, 'id' | 'created_at' | 'updated_at' | 'property_id' | 'reported_by' | 'completed_date' | 'actual_cost' | 'attachment_urls' | 'completed_at'> = { // Added completed_at to omit list
            title: values.title,
            description: values.description || null,
            status: values.status,
            priority: values.priority,
            assignee_id: values.assignee_id || null, // Already handled in Controller
            vendor_name: values.vendor_name || null,
            vendor_contact: values.vendor_contact || null,
            scheduled_date_start: values.scheduled_date_start ? values.scheduled_date_start.toISOString() : null,
            scheduled_date_end: values.scheduled_date_end ? values.scheduled_date_end.toISOString() : null,
            estimated_cost: values.estimated_cost ? Number(values.estimated_cost) : null,
            blocks_booking: values.blocks_booking,
        };

        console.log("Submitting Task Data:", taskDataToInsert);
        const success = await addTask(taskDataToInsert as any); // Fix type later
        setIsSubmitting(false);

        if (!success) {
            console.error("addTask function indicated failure.");
             // Assuming addTask handles its own error toasts
        } else {
            toast({ title: "Success", description: `Task "${values.title}" created.` });
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
             <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                 <DialogHeader> <DialogTitle>Add New Maintenance Task</DialogTitle> <DialogDescription> Enter the details for the new task for property: {selectedProperty?.name || 'N/A'}. </DialogDescription> </DialogHeader>
                 {/* --- Add Log to form's onSubmit prop --- */}
                 <form onSubmit={(e) => {
                        console.log("AddTaskDialog: Form DOM onSubmit event triggered."); // <-- ADDED THIS LOG
                        handleSubmit(onSubmit)(e);
                    }}
                    className="space-y-4 p-1"
                 >
                     {/* Title */}
                     <div className="space-y-1">
                         <Label htmlFor="title">Title *</Label>
                         <Input id="title" {...register("title")} placeholder="e.g., Repaint master bedroom" aria-invalid={errors.title ? "true" : "false"} />
                         <FieldError message={errors.title?.message} />
                     </div>

                     {/* Description */}
                     <div className="space-y-1">
                         <Label htmlFor="description">Description</Label>
                         <Textarea id="description" {...register("description")} placeholder="Add details..." />
                         <FieldError message={errors.description?.message} />
                     </div>

                     {/* Priority & Status */}
                     <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                             <Label>Priority *</Label>
                             <Controller
                                 name="priority"
                                 control={control}
                                 render={({ field }) => (
                                     <Select onValueChange={field.onChange} value={field.value}>
                                         <SelectTrigger aria-invalid={errors.priority ? "true" : "false"}><SelectValue placeholder="Select priority" /></SelectTrigger>
                                         <SelectContent> {Object.values(MaintenancePriority).map(p => (<SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>))} </SelectContent>
                                     </Select>
                                 )}
                             />
                             <FieldError message={errors.priority?.message} />
                         </div>
                         <div className="space-y-1">
                             <Label>Status *</Label>
                             <Controller
                                 name="status"
                                 control={control}
                                 render={({ field }) => (
                                     <Select onValueChange={field.onChange} value={field.value}>
                                         <SelectTrigger aria-invalid={errors.status ? "true" : "false"}><SelectValue placeholder="Select status" /></SelectTrigger>
                                         <SelectContent> {Object.values(MaintenanceStatus).map(s => (<SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</SelectItem>))} </SelectContent>
                                     </Select>
                                 )}
                             />
                             <FieldError message={errors.status?.message} />
                         </div>
                     </div>

                     {/* Assignee */}
                     <div className="space-y-1">
                          <Label>Assignee</Label>
                          <Controller
                              name="assignee_id"
                              control={control}
                              render={({ field }) => (
                                  <Select
                                      onValueChange={(value) => field.onChange(value === "unassigned" ? null : value)}
                                      value={field.value ?? 'unassigned'}
                                  >
                                      <SelectTrigger aria-invalid={errors.assignee_id ? "true" : "false"}><SelectValue placeholder="Select assignee" /></SelectTrigger>
                                      <SelectContent>
                                          <SelectItem value="unassigned">-- Unassigned --</SelectItem>
                                          {uniqueAssigneeMembers.map(pm => (
                                              <SelectItem key={pm.user_id} value={pm.user_id}>
                                                  {`${pm.profile!.first_name || ''} ${pm.profile!.last_name || ''} (${pm.profile!.email || 'No email'})`.trim()}
                                              </SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                              )}
                          />
                          <FieldError message={errors.assignee_id?.message} />
                     </div>

                      {/* Vendor Info */}
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                             <Label htmlFor="vendor_name">Vendor Name</Label>
                             <Input id="vendor_name" {...register("vendor_name")} placeholder="Optional" />
                             <FieldError message={errors.vendor_name?.message} />
                         </div>
                         <div className="space-y-1">
                             <Label htmlFor="vendor_contact">Vendor Contact</Label>
                             <Input id="vendor_contact" {...register("vendor_contact")} placeholder="Optional phone/email" />
                             <FieldError message={errors.vendor_contact?.message} />
                         </div>
                      </div>

                     {/* Estimated Cost */}
                     <div className="space-y-1">
                          <Label htmlFor="estimated_cost">Estimated Cost ($)</Label>
                          <Input id="estimated_cost" type="number" step="0.01" min="0" placeholder="e.g., 150.00"
                              {...register("estimated_cost", { setValueAs: (v) => v === "" ? null : parseFloat(v) })}
                              aria-invalid={errors.estimated_cost ? "true" : "false"}
                          />
                          <FieldError message={errors.estimated_cost?.message} />
                     </div>

                      {/* Date Pickers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <Label>Scheduled Start Date</Label>
                              <Controller
                                  name="scheduled_date_start"
                                  control={control}
                                  render={({ field }) => (
                                      <Popover>
                                          <PopoverTrigger
                                              className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground", buttonVariants({ variant: "outline" }))}
                                              aria-invalid={errors.scheduled_date_start ? "true" : "false"}
                                              type="button"
                                          >
                                              <span className="flex items-center justify-between w-full"> {field.value ? format(field.value, "PPP") : <span>Pick a date</span>} <CalendarIcon className="ml-2 h-4 w-4 opacity-50" /> </span>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0" align="start">
                                              <Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} initialFocus />
                                          </PopoverContent>
                                      </Popover>
                                  )}
                              />
                              <FieldError message={errors.scheduled_date_start?.message} />
                          </div>
                          <div className="space-y-1">
                              <Label>Scheduled End Date</Label>
                              <Controller
                                  name="scheduled_date_end"
                                  control={control}
                                  render={({ field }) => (
                                      <Popover>
                                          <PopoverTrigger
                                              disabled={!watch('scheduled_date_start')}
                                              className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground", buttonVariants({ variant: "outline" }))}
                                              aria-invalid={errors.scheduled_date_end ? "true" : "false"}
                                              type="button"
                                          >
                                              <span className="flex items-center justify-between w-full"> {field.value ? format(field.value, "PPP") : <span>Pick a date</span>} <CalendarIcon className="ml-2 h-4 w-4 opacity-50" /> </span>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0" align="start">
                                              <Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} disabled={(date) => { const startDate = getValues("scheduled_date_start"); return startDate ? date < startOfDay(startDate) : false; }} initialFocus />
                                          </PopoverContent>
                                      </Popover>
                                  )}
                               />
                              <FieldError message={errors.scheduled_date_end?.message} />
                          </div>
                      </div>

                     {/* Blocks Booking */}
                     <div className={cn("flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm", errors.blocks_booking && "border-destructive")}>
                          <Controller
                              name="blocks_booking"
                              control={control}
                              render={({ field }) => (
                                  <Checkbox
                                      id="add-blocks-booking-manual"
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      aria-invalid={errors.blocks_booking ? "true" : "false"}
                                  />
                              )}
                          />
                          <div className="space-y-1 leading-none">
                              <Label htmlFor="add-blocks-booking-manual" className="font-medium cursor-pointer">Block Bookings During Maintenance</Label>
                              <p className="text-sm text-muted-foreground">Prevent new bookings during the scheduled start/end dates.</p>
                               <FieldError message={errors.blocks_booking?.message} />
                          </div>
                     </div>

                     {/* Footer */}
                     <DialogFooter className="pt-4">
                         <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}> Cancel </Button>
                         <Button type="submit" disabled={!selectedProperty || isSubmitting}> {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add Task </Button>
                     </DialogFooter>
                 </form>
             </DialogContent>
         </Dialog>
    );
};