import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton'; // For loading state

// Property types list (keep consistent with NewProperty)
const propertyTypes = [
  "Vacation Home",
  "Family Cabin",
  "Beach House",
  "Mountain Retreat",
  "Lakefront Property",
  "Urban Apartment",
  "Investment Property",
  "Inherited Estate",
  "Other",
];

// Define the expected shape of form data
interface EditFormData {
    name: string;
    type: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
    description: string;
}

const EditProperty = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { properties, isLoading: isContextLoading, updateProperty, refreshProperties } = useProperty();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true); // Separate loading state for this component

  // Initialize form data state
  const [formData, setFormData] = useState<EditFormData>({
    name: "",
    type: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "",
    description: "",
  });

  // Effect to find and load property data into the form
  useEffect(() => {
    setIsLoadingData(true); // Start loading specific property data

    // Function to find and set data
    const loadData = () => {
        if (!isContextLoading && propertyId) {
            const propertyToEdit = properties.find(p => p.id === propertyId);
            if (propertyToEdit) {
                setFormData({
                    name: propertyToEdit.name || "",
                    type: propertyToEdit.type || "",
                    address: propertyToEdit.address || "",
                    city: propertyToEdit.city || "",
                    state: propertyToEdit.state || "",
                    zip_code: propertyToEdit.zip_code || "",
                    country: propertyToEdit.country || "",
                    description: propertyToEdit.description || "",
                });
                setIsLoadingData(false); // Data loaded
            } else {
                // Property not found in context after context loaded
                toast({ title: "Error", description: "Property not found.", variant: "destructive" });
                navigate("/properties"); // Redirect if not found
            }
        }
        // If context is still loading, wait for next render cycle
    };

    // If properties are already loaded, load immediately
    if (!isContextLoading) {
        loadData();
    }
    // Otherwise, loadData will run when isContextLoading changes to false

  }, [propertyId, properties, isContextLoading, navigate, toast]); // Dependencies

  // Handle input changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return; // Should not happen if we are on this page

    setIsSubmitting(true);
    try {
      const updatedProperty = await updateProperty(propertyId, {
        name: formData.name,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        country: formData.country,
        description: formData.description || null, // Ensure null if empty
      });

      if (updatedProperty) {
        navigate("/properties"); // Navigate back to the list on success
      }
      // Error toast is handled within updateProperty context function
    } catch (error) {
      // Catch errors not handled by context (though it should handle them)
      console.error("Submit error:", error);
      toast({ title: "Error", description: "Failed to update property.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state UI
  if (isLoadingData || isContextLoading) {
     return (
      <div className="max-w-3xl mx-auto p-6 lg:p-8 space-y-4 animate-fade-in">
        <Skeleton className="h-9 w-1/3 mb-2" />
        <Skeleton className="h-5 w-1/2 mb-6" />
        <Card>
            <CardHeader>
                <Skeleton className="h-7 w-1/4 mb-2"/>
                <Skeleton className="h-5 w-1/2"/>
            </CardHeader>
          <CardContent className="p-6 space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-7 w-1/4 mt-4 mb-2"/>
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-28" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main Edit Form UI
  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-poppins font-bold text-gray-800 mb-1">
          Edit Property
        </h1>
        <p className="text-muted-foreground font-inter">
          Update the details for "{formData.name}"
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="font-poppins font-semibold">Property Information</CardTitle>
            <CardDescription className="font-inter">
              Modify the information about your property.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* === Fields identical to NewProperty.tsx === */}
            <div className="space-y-2">
              <Label htmlFor="name" className="font-inter">Property Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Mountain View Cabin"
                required
                value={formData.name}
                onChange={handleChange}
                className="font-inter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="font-inter">Property Type</Label>
              <Select
                value={formData.type} // Use pre-populated value
                onValueChange={(value) => handleSelectChange("type", value)}
                required
              >
                <SelectTrigger className="font-inter">
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (
                    // Make sure value matches what's stored (likely lowercase)
                    <SelectItem key={type} value={type} className="font-inter">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="font-inter">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief description of your property"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="font-inter"
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-poppins font-semibold">Location</h3>

              <div className="space-y-2">
                <Label htmlFor="address" className="font-inter">Street Address</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Street address"
                  required
                  value={formData.address}
                  onChange={handleChange}
                  className="font-inter"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city" className="font-inter">City</Label>
                  <Input
                    id="city"
                    name="city"
                    placeholder="City"
                    required
                    value={formData.city}
                    onChange={handleChange}
                    className="font-inter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state" className="font-inter">State/Province</Label>
                  <Input
                    id="state"
                    name="state"
                    placeholder="State/Province"
                    required
                    value={formData.state}
                    onChange={handleChange}
                    className="font-inter"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zip_code" className="font-inter">ZIP/Postal Code</Label>
                  <Input
                    id="zip_code"
                    name="zip_code"
                    placeholder="ZIP/Postal Code"
                    required
                    value={formData.zip_code}
                    onChange={handleChange}
                    className="font-inter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country" className="font-inter">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    placeholder="Country"
                    required
                    value={formData.country}
                    onChange={handleChange}
                    className="font-inter"
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/properties")} // Go back to list
              disabled={isSubmitting}
              className="font-inter"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="font-inter"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default EditProperty;