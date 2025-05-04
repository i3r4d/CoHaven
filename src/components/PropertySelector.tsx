import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
// Removed Plus, Settings imports as they are no longer used here
import { useNavigate } from "react-router-dom";
import { useProperty } from "@/contexts/PropertyContext";
import { Database } from '@/integrations/supabase/types';
import { cn } from "@/lib/utils"; // Import cn utility

type Property = Database['public']['Tables']['properties']['Row'];

export const PropertySelector = () => {
  const navigate = useNavigate();
  const { properties, selectedProperty, selectProperty, isLoading } = useProperty();

  // handleCreateProperty function is no longer needed here if button is removed
  // const handleCreateProperty = () => {
  //   navigate("/properties/new");
  // };

  const handleSelectProperty = (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId) || null;
    selectProperty(property);
  };

  // handlePropertySettings function is no longer needed here if button is removed
  // const handlePropertySettings = () => {
  //   if (selectedProperty) {
  //     navigate("/settings"); // Or maybe property-specific settings? /properties/{id}/settings
  //   }
  // };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {/* Use consistent text colors */}
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Loading Properties...
        </div>
         {/* Use consistent loading placeholder colors */}
        <div className="h-9 bg-gray-200 border border-gray-300 rounded-md animate-pulse"/>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          No Properties Yet
        </div>
        {/* Keep button here if you want users to add first property from sidebar */}
        {/* If navigation 'Properties' links to list/add, can remove this */}
        <Button
          onClick={() => navigate("/properties/new")} // Simplified handler
          variant="outline"
           // Use consistent styling
          className="w-full border-gray-300 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
        >
           {/* <Plus className="mr-2 h-4 w-4" /> Removed icon for cleaner look maybe? */}
          Add First Property
        </Button>
      </div>
    );
  }

  // Main Selector View
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Current Property
      </div>
      {/* Removed outer flex container as settings button is gone */}
      <Select
        value={selectedProperty?.id || ""} // Ensure value is string or undefined, added fallback ""
        onValueChange={handleSelectProperty}
        disabled={properties.length === 0} // Disable if no properties
      >
        <SelectTrigger
           // Apply conditional styling for selected state
           // Match active nav item: bg-slate-700 text-white
           // Default: bg-white text-gray-700 border-gray-300
          className={cn(
            "border transition-colors w-full", // Base styles
            selectedProperty
             ? "bg-slate-700 text-white border-slate-700 hover:bg-slate-600" // Selected state
             : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50" // Default state
          )}
        >
          <SelectValue placeholder="Select a property..." >
             {/* Ensure text color contrasts with background */}
            <span className={cn(selectedProperty ? "text-white" : "text-gray-700")}>
                {selectedProperty ? selectedProperty.name : "Select a property..."}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {properties.map((property) => (
            <SelectItem key={property.id} value={property.id}>
              {property.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* *** Settings Button Removed *** */}
      {/* {selectedProperty && (
        <Button
          onClick={handlePropertySettings}
          variant="outline"
          size="icon"
          className="border-sidebar-border text-sidebar-foreground"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )} */}

      {/* *** Add Property Button Below Dropdown Removed *** */}
      {/* <Button
        onClick={handleCreateProperty}
        variant="outline"
        size="sm"
        className="w-full border-sidebar-border text-sidebar-foreground"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Property
      </Button> */}
    </div>
  );
};