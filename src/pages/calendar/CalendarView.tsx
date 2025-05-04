import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays, isBefore, isAfter, isSameDay } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/contexts/PropertyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

type Booking = Database['public']['Tables']['bookings']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface BookingWithProfile extends Booking {
  profile?: Profile;
}

const CalendarView = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedProperty } = useProperty();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<BookingWithProfile | null>(null);
  const [bookings, setBookings] = useState<BookingWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedRange, setSelectedRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: new Date(),
    to: addDays(new Date(), 2),
  });
  
  const [formData, setFormData] = useState({
    numGuests: "1",
    purpose: "",
  });

  useEffect(() => {
    const fetchBookings = async () => {
      if (!selectedProperty) {
        setBookings([]);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('property_id', selectedProperty.id);
          
        if (error) throw error;
        
        const userIds = Array.from(new Set((data || []).map(booking => booking.user_id)));
        
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
          
        if (profilesError) throw profilesError;
        
        const bookingsWithProfiles: BookingWithProfile[] = (data || []).map(booking => {
          const profile = profiles?.find(p => p.id === booking.user_id);
          return { ...booking, profile };
        });
        
        setBookings(bookingsWithProfiles);
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to load bookings",
          variant: "destructive",
        });
        console.error("Error fetching bookings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBookings();
  }, [selectedProperty]);
  
  useEffect(() => {
    if (!isDialogOpen) {
      setEditingBooking(null);
      setSelectedRange({
        from: new Date(),
        to: addDays(new Date(), 2),
      });
      setFormData({
        numGuests: "1",
        purpose: "",
      });
    }
  }, [isDialogOpen]);
  
  useEffect(() => {
    if (editingBooking) {
      setSelectedRange({
        from: new Date(editingBooking.start_date),
        to: new Date(editingBooking.end_date),
      });
      setFormData({
        numGuests: String(editingBooking.num_guests),
        purpose: editingBooking.purpose || "",
      });
    }
  }, [editingBooking]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const isDateBooked = (date: Date) => {
    return bookings.some(booking => {
      const startDate = new Date(booking.start_date);
      const endDate = new Date(booking.end_date);
      return (
        (isAfter(date, startDate) || isSameDay(date, startDate)) && 
        (isBefore(date, endDate) || isSameDay(date, endDate))
      );
    });
  };
  
  const getUserName = (booking: BookingWithProfile) => {
    if (!booking.profile) return "Unknown";
    return `${booking.profile.first_name} ${booking.profile.last_name}`;
  };
  
  const isOverlappingBooking = () => {
    if (!selectedRange.from || !selectedRange.to) return false;
    
    return bookings.some(booking => {
      if (editingBooking && editingBooking.id === booking.id) return false;
      
      const bookingStart = new Date(booking.start_date);
      const bookingEnd = new Date(booking.end_date);
      
      return !(
        isAfter(bookingStart, selectedRange.to) || 
        isAfter(selectedRange.from, bookingEnd)
      );
    });
  };
  
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProperty || !user || !selectedRange.from || !selectedRange.to) {
      toast({
        title: "Error",
        description: "Missing required information",
        variant: "destructive",
      });
      return;
    }
    
    if (isOverlappingBooking()) {
      toast({
        title: "Booking Conflict",
        description: "The selected dates overlap with an existing booking",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const bookingData = {
        property_id: selectedProperty.id,
        user_id: user.id,
        start_date: format(selectedRange.from, 'yyyy-MM-dd'),
        end_date: format(selectedRange.to, 'yyyy-MM-dd'),
        num_guests: parseInt(formData.numGuests),
        purpose: formData.purpose || null,
        status: "pending",
      };
      
      if (editingBooking) {
        const { error } = await supabase
          .from('bookings')
          .update(bookingData)
          .eq('id', editingBooking.id);
          
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Booking has been updated successfully.",
        });
      } else {
        const { error } = await supabase
          .from('bookings')
          .insert(bookingData);
          
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Booking request has been submitted successfully.",
        });
      }
      
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('property_id', selectedProperty.id);
        
      if (!error && data) {
        const userIds = Array.from(new Set(data.map(booking => booking.user_id)));
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
          
        const bookingsWithProfiles: BookingWithProfile[] = data.map(booking => {
          const profile = profiles?.find(p => p.id === booking.user_id);
          return { ...booking, profile };
        });
        
        setBookings(bookingsWithProfiles);
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteBooking = async (booking: BookingWithProfile) => {
    if (!window.confirm("Are you sure you want to delete this booking?")) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', booking.id);
        
      if (error) throw error;
      
      setBookings(bookings.filter(b => b.id !== booking.id));
      
      toast({
        title: "Success",
        description: "Booking has been deleted successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete booking",
        variant: "destructive",
      });
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };
  
  const handleUpdateStatus = async (booking: BookingWithProfile, status: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', booking.id);
        
      if (error) throw error;
      
      setBookings(bookings.map(b => 
        b.id === booking.id ? { ...b, status } : b
      ));
      
      toast({
        title: "Success",
        description: `Booking has been ${status}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update booking status",
        variant: "destructive",
      });
    }
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setSelectedRange({
        from: range.from,
        to: range.to,
      });
    } else if (range?.from) {
      setSelectedRange({
        from: range.from,
        to: range.from,
      });
    }
  };

  if (!selectedProperty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-xl font-serif font-medium mb-2">
            No Property Selected
          </h3>
          <p className="text-muted-foreground mb-6">
            Please select or create a property to manage bookings
          </p>
          <Button 
            onClick={() => window.location.href = "/properties"}
            className="bg-navy-900 hover:bg-navy-800"
          >
            Go to Properties
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-serif font-bold text-navy-900">Calendar</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-navy-900 hover:bg-navy-800">
              Request Booking
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="font-serif">
                {editingBooking ? 'Edit Booking' : 'Request a Booking'}
              </DialogTitle>
              <DialogDescription>
                {editingBooking 
                  ? 'Update your booking details below'
                  : 'Select dates and provide booking details'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleBookingSubmit}>
              <div className="grid gap-6 py-4">
                <div className="space-y-2">
                  <Label>Select Dates</Label>
                  <div className="border rounded-md p-3">
                    <Calendar
                      mode="range"
                      selected={{ 
                        from: selectedRange.from, 
                        to: selectedRange.to 
                      }}
                      onSelect={handleDateRangeChange}
                      disabled={(date) => isBefore(date, new Date())}
                      className="mx-auto"
                    />
                  </div>
                  {selectedRange.from && selectedRange.to && (
                    <p className="text-sm text-center text-muted-foreground">
                      {format(selectedRange.from, 'MMM d, yyyy')} - {format(selectedRange.to, 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="numGuests">Number of Guests</Label>
                  <Input
                    id="numGuests"
                    name="numGuests"
                    type="number"
                    min="1"
                    value={formData.numGuests}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="purpose">Purpose (Optional)</Label>
                  <Textarea
                    id="purpose"
                    name="purpose"
                    placeholder="e.g., Family vacation, work retreat, etc."
                    value={formData.purpose}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-navy-900 hover:bg-navy-800"
                  disabled={!selectedRange.from || !selectedRange.to}
                >
                  {editingBooking ? 'Update Booking' : 'Request Booking'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif">Property Calendar</CardTitle>
            <CardDescription>
              View and manage bookings for {selectedProperty.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin h-8 w-8 border-4 border-navy-900 rounded-full border-t-transparent"></div>
              </div>
            ) : (
              <div className="p-3">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="mx-auto"
                  modifiers={{
                    booked: (date) => isDateBooked(date),
                  }}
                  modifiersClassNames={{
                    booked: "bg-red-100 text-red-700 hover:bg-red-200",
                  }}
                />
                <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                  <div className="flex items-center">
                    <div className="h-3 w-3 bg-red-100 border border-red-200 rounded-sm mr-1"></div>
                    <span>Booked</span>
                  </div>
                  <div className="flex items-center">
                    <div className="h-3 w-3 bg-white border border-gray-200 rounded-sm mr-1"></div>
                    <span>Available</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-serif">Upcoming Bookings</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-3 border rounded-md animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  </div>
                ))}
              </div>
            ) : bookings.length > 0 ? (
              <div className="space-y-2 max-h-[450px] overflow-y-auto">
                {bookings
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map(booking => (
                    <div key={booking.id} className="p-3 border rounded-md hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">{getUserName(booking)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(booking.start_date), 'MMM d')} - {format(new Date(booking.end_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium text-white",
                          getStatusColor(booking.status)
                        )}>
                          {booking.status}
                        </div>
                      </div>
                      <p className="text-sm">{booking.num_guests} guests</p>
                      {booking.purpose && (
                        <p className="text-xs text-muted-foreground mt-1">{booking.purpose}</p>
                      )}
                      
                      <div className="mt-3 flex gap-2 justify-end">
                        {booking.user_id === user?.id && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="px-2 py-1 h-auto text-xs"
                              onClick={() => {
                                setEditingBooking(booking);
                                setIsDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="px-2 py-1 h-auto text-xs text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDeleteBooking(booking)}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        
                        {booking.user_id !== user?.id && booking.status === 'pending' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="px-2 py-1 h-auto text-xs text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => handleUpdateStatus(booking, 'approved')}
                            >
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="px-2 py-1 h-auto text-xs text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleUpdateStatus(booking, 'rejected')}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                No bookings found. Use the "Request Booking" button to schedule your stay.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarView;
