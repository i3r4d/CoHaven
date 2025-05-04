
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useProperty } from "@/contexts/PropertyContext";

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

const NewProperty = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createProperty } = useProperty();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "",
    description: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create the property in Supabase
      const newProperty = await createProperty({
        name: formData.name,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        country: formData.country,
        description: formData.description || null,
      });
      
      if (newProperty) {
        // Navigate to the dashboard with the newly created property selected
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "There was a problem creating your property.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-navy-900 mb-2">
          Add a New Property
        </h1>
        <p className="text-muted-foreground">
          Enter the details of your co-owned property
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="font-serif">Property Information</CardTitle>
            <CardDescription>
              Basic information about your property
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Property Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Mountain View Cabin"
                required
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Property Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => handleSelectChange("type", value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (
                    <SelectItem key={type} value={type.toLowerCase()}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief description of your property"
                value={formData.description}
                onChange={handleChange}
                rows={4}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Location</h3>

              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Street address"
                  required
                  value={formData.address}
                  onChange={handleChange}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    placeholder="City"
                    required
                    value={formData.city}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    name="state"
                    placeholder="State/Province"
                    required
                    value={formData.state}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zip_code">ZIP/Postal Code</Label>
                  <Input
                    id="zip_code"
                    name="zip_code"
                    placeholder="ZIP/Postal Code"
                    required
                    value={formData.zip_code}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    placeholder="Country"
                    required
                    value={formData.country}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-navy-900 hover:bg-navy-800"
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create Property"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default NewProperty;
