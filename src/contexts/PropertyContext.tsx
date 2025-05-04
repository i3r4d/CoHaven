// src/contexts/PropertyContext.tsx
// Refined useEffect logic to be more robust against focus-triggered refetches.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Database, Property, PropertyMember, Profile, PropertyMemberWithProfile } from '@/integrations/supabase/types';

type PropertyInsertData = Omit<Property, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'image_url'>;
type PropertyUpdateData = Partial<Omit<Property, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'image_url'>>;

interface PropertyContextType {
  selectedProperty: Property | null;
  properties: Property[];
  propertyMembers: PropertyMemberWithProfile[];
  isLoading: boolean; // Represents loading of properties/members for the current user
  error: string | null;
  selectProperty: (property: Property | null) => void;
  refreshProperties: (triggeredBy?: string) => Promise<void>;
  createProperty: (propertyData: PropertyInsertData) => Promise<Property | null>;
  updateProperty: (propertyId: string, propertyData: PropertyUpdateData) => Promise<Property | null>;
  deleteProperty: (propertyId: string) => Promise<boolean>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

// Helper function to safely get item from localStorage
const getStoredPropertyId = (): string | null => {
    try {
        return localStorage.getItem('selectedPropertyId');
    } catch (e) {
        console.error("Error reading localStorage:", e);
        return null;
    }
};

// Helper function to safely set item in localStorage
const setStoredPropertyId = (id: string | null): void => {
     try {
        if (id) {
            localStorage.setItem('selectedPropertyId', id);
        } else {
            localStorage.removeItem('selectedPropertyId');
        }
    } catch (e) {
        console.error("Error writing to localStorage:", e);
    }
};


export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyMembers, setPropertyMembers] = useState<PropertyMemberWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Initial load is true
  const [error, setError] = useState<string | null>(null);

  // --- Effect to Fetch Properties When User Changes ---
  useEffect(() => {
    const currentUserId = user?.id;
    console.log("PropertyContext: User/Auth effect running. User ID:", currentUserId ?? 'null');

    // Define the async fetch function directly inside the effect
    const loadUserDataAndProperties = async (userId: string) => {
      // Only set loading true if we are actually fetching for a new user or initial load
      // Avoid setting loading true on every focus-triggered re-render if user hasn't changed
      setIsLoading(true); // Set loading true when fetching starts for this user
      setError(null);
      setPropertyMembers([]); // Clear derived state

      try {
        // Fetch memberships
        const { data: memberships, error: membershipError } = await supabase
          .from('property_members')
          .select('property_id')
          .eq('user_id', userId);
        if (membershipError) throw membershipError;

        if (!memberships || memberships.length === 0) {
          console.log("PropertyContext: User has no property memberships.");
          setProperties([]);
          setSelectedProperty(null); // Explicitly set to null
          setPropertyMembers([]);
          setStoredPropertyId(null); // Clear storage
          return; // Exit early, finished loading for this user (no properties)
        }

        // Fetch properties
        const propertyIds = memberships.map(member => member.property_id);
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties').select('*').in('id', propertyIds);
        if (propertiesError) throw propertiesError;

        const fetchedProperties = propertiesData || [];
        const sortedProperties = fetchedProperties.sort((a, b) => a.name.localeCompare(b.name));
        setProperties(sortedProperties); // Update properties state

        // Fetch all members for these properties & enrich
        let enrichedMembers: PropertyMemberWithProfile[] = [];
        if (sortedProperties.length > 0) { // Only fetch members if properties exist
            const { data: allMembersData, error: membersError } = await supabase
                .from('property_members').select('*').in('property_id', propertyIds);
            if (membersError) throw membersError;
            const allMembers = allMembersData || [];

            if (allMembers.length > 0) {
                const uniqueUserIds = [...new Set(allMembers.map(m => m.user_id))];
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles').select('*').in('id', uniqueUserIds);

                if (profilesError) {
                    console.error("PropertyContext: Error fetching profiles:", profilesError);
                    enrichedMembers = allMembers.map(member => ({ ...member, profile: null }));
                } else {
                    const profileMap = new Map((profilesData || []).map(p => [p.id, p]));
                    enrichedMembers = allMembers.map(member => ({ ...member, profile: profileMap.get(member.user_id) || null }));
                }
            }
        }
        setPropertyMembers(enrichedMembers);
        console.log("PropertyContext: Updated enriched propertyMembers state:", enrichedMembers.length);

        // Determine initial selection more carefully
        let propertyToSelect: Property | null = null;
        const savedPropertyId = getStoredPropertyId();

        if (savedPropertyId) {
            const savedProperty = sortedProperties.find(p => p.id === savedPropertyId);
            if (savedProperty) {
                propertyToSelect = savedProperty;
                console.log(`PropertyContext: Found matching saved property ID: ${savedPropertyId}`);
            } else {
                 console.log(`PropertyContext: Saved property ID ${savedPropertyId} not found in fetched list. Clearing.`);
                 setStoredPropertyId(null); // Clear invalid stored ID
            }
        }

        // Fallback to first property if no valid saved ID
        if (!propertyToSelect && sortedProperties.length > 0) {
            propertyToSelect = sortedProperties[0];
            console.log(`PropertyContext: No valid saved property, selecting first property: ${propertyToSelect.id}`);
        }

        // Set the selected property state ONLY IF it's different or initially null
        setSelectedProperty(currentSelection => {
            const newSelectionId = propertyToSelect?.id ?? null;
            const currentSelectionId = currentSelection?.id ?? null;

            if (newSelectionId !== currentSelectionId) {
                console.log(`PropertyContext: Setting selected property in state: ${newSelectionId}`);
                setStoredPropertyId(newSelectionId); // Update storage
                return propertyToSelect; // Update state
            }
            // If ID is same, check if data differs (e.g., name changed) - unlikely needed here as full list is refetched
            if (propertyToSelect && currentSelection && JSON.stringify(currentSelection) !== JSON.stringify(propertyToSelect)) {
                console.log(`PropertyContext: Updating data for selected property ID: ${newSelectionId}`);
                 return propertyToSelect;
            }
            // Otherwise, no change needed, prevent unnecessary state update
            console.log(`PropertyContext: Selected property state unchanged (${currentSelectionId}).`);
            return currentSelection;
        });

      } catch (err: any) {
        setError(err.message);
        console.error("PropertyContext: Error loading properties/members:", err);
        toast({ title: "Error Loading Properties", description: err.message || "Failed to load property data.", variant: "destructive" });
        // Reset state on error
        setProperties([]);
        setSelectedProperty(null);
        setPropertyMembers([]);
        setStoredPropertyId(null);
      } finally {
        console.log("PropertyContext: Fetch completed, setting isLoading to false.");
        setIsLoading(false); // Ensure loading is set to false after fetch completes/fails
      }
    };

    // Trigger the fetch logic
    if (currentUserId) {
      loadUserDataAndProperties(currentUserId);
    } else {
      // No user, reset state and ensure loading is false
      console.log("PropertyContext: No user ID, resetting state.");
      setProperties([]);
      setSelectedProperty(null);
      setPropertyMembers([]);
      setStoredPropertyId(null);
      setError(null);
      if (isLoading) setIsLoading(false); // Ensure loading is false if user logs out while loading
    }

    // No cleanup function needed here as Supabase client handles its own listeners internally
  }, [user?.id, toast]); // Depend only on user ID and stable toast function


  // --- Manual Select Property Handler ---
  const selectProperty = useCallback((property: Property | null) => {
    // Use functional update to compare against the *latest* state
    setSelectedProperty(currentSelection => {
        const newId = property?.id ?? null;
        const currentId = currentSelection?.id ?? null;
        if (newId !== currentId) {
            console.log("PropertyContext: Manually selecting property:", newId);
            setStoredPropertyId(newId); // Update storage
            return property; // Update state
        }
        return currentSelection; // No change needed
    });
  }, []); // No dependencies needed

  // --- CRUD Operations ---
  // Wrapped in useCallback to memoize them
  const createProperty = useCallback(async (propertyData: PropertyInsertData): Promise<Property | null> => {
     // ... createProperty logic unchanged ...
     if (!user) { toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" }); return null; }
     setIsLoading(true); setError(null);
     try {
         const { data: { user: currentUser }, error: userFetchError } = await supabase.auth.getUser();
         if (userFetchError || !currentUser) throw new Error("Authentication failed.");
         const { data: insertResult, error: propertyInsertError } = await supabase
             .from('properties').insert({ ...propertyData, created_by: currentUser.id }).select('id').single();
         if (propertyInsertError) throw propertyInsertError;
         const insertedPropertyId = insertResult?.id;
         if (!insertedPropertyId) throw new Error('Failed to get ID of created property.');
         const { error: memberInsertError } = await supabase
             .from('property_members').insert({ property_id: insertedPropertyId, user_id: currentUser.id, role: 'owner', ownership_percentage: 100 });
         if (memberInsertError) { console.error("PropertyContext: Failed to add owner membership:", memberInsertError); }
         const { data: finalPropertyData, error: fetchError } = await supabase
             .from('properties').select('*').eq('id', insertedPropertyId).single();
         if (fetchError || !finalPropertyData) throw new Error(`Property created (${insertedPropertyId}), but failed to fetch final data: ${fetchError?.message ?? 'Not found'}`);
         toast({ title: "Success", description: `Property "${finalPropertyData.name}" created.` });
         await refreshProperties('createProperty'); // Use refreshProperties
         selectProperty(finalPropertyData); // Select the newly created property
         return finalPropertyData;
     } catch (err: any) {
         setError(err.message); console.error(`PropertyContext: Error Creating Property: ${err.message}`, err);
         toast({ title: "Error Creating Property", description: err.message || "An unexpected error occurred.", variant: "destructive" });
         return null;
     } finally { setIsLoading(false); }
  }, [user, toast, selectProperty]); // Added selectProperty dependency

  const updateProperty = useCallback(async (propertyId: string, propertyData: PropertyUpdateData): Promise<Property | null> => {
      // ... updateProperty logic largely unchanged, but relies on refreshProperties ...
      if (!user) { toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" }); return null; }
      // Avoid setting global loading if possible, or use a different loading state? For now, keep global.
      setIsLoading(true); setError(null);
      try {
          const updatePayload = { ...propertyData, updated_at: new Date().toISOString() };
          // Remove fields that shouldn't be updated manually
          delete (updatePayload as any).id; delete (updatePayload as any).created_at; delete (updatePayload as any).created_by; delete (updatePayload as any).image_url;

          const { data: updatedProperty, error: updateError } = await supabase
              .from('properties').update(updatePayload).eq('id', propertyId).select('*').single();

          if (updateError) throw updateError;
          if (!updatedProperty) throw new Error(`Failed to update property or retrieve updated data.`);

          toast({ title: "Success", description: `Property "${updatedProperty.name}" updated.` });

          // Manually update the properties list and selected property immediately
          // for better UX instead of waiting for full refresh.
          setProperties(prev => prev.map(p => p.id === propertyId ? updatedProperty : p));
          setSelectedProperty(current => (current?.id === propertyId ? updatedProperty : current));

          // Trigger background refresh to ensure consistency (e.g., member data if that changes)
          refreshProperties('updateProperty'); // Use refreshProperties

          return updatedProperty;
      } catch (err: any) {
          setError(err.message); console.error(`PropertyContext: Error Updating Property ${propertyId}: ${err.message}`, err);
          toast({ title: "Error Updating Property", description: err.message || "An unexpected error occurred.", variant: "destructive" });
          return null;
      } finally { setIsLoading(false); } // Set loading false after update attempt
  }, [user, toast]); // Removed selectedProperty dependency, added refreshProperties

  const deleteProperty = useCallback(async (propertyId: string): Promise<boolean> => {
      // ... deleteProperty logic unchanged ...
      if (!user) { toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" }); return false; }
      setIsLoading(true); setError(null);
      console.log(`PropertyContext: Attempting to delete property ${propertyId}`);
      try {
          // RLS should handle cascading deletes for members, etc. if set up.
          // If not, manual deletion of related data might be needed here.
          const { error: propertyDeleteError } = await supabase.from('properties').delete().eq('id', propertyId);
          if (propertyDeleteError) throw propertyDeleteError;
          console.log(`PropertyContext: Property ${propertyId} deleted successfully.`);
          toast({ title: "Success", description: "Property deleted." });

          // Clear selection if the deleted property was selected
          if (selectedProperty?.id === propertyId) {
             selectProperty(null);
          }
          // Immediately remove from local state
          setProperties(prev => prev.filter(p => p.id !== propertyId));

          // No need to await refresh if we update state manually? Re-evaluate.
          // Let's keep the refresh for now to ensure full consistency.
          refreshProperties('deleteProperty'); // Use refreshProperties

          return true;
      } catch (err: any) {
          setError(err.message); console.error(`PropertyContext: Error Deleting Property ${propertyId}: ${err.message}`, err);
          toast({ title: "Error Deleting Property", description: err.message || "An unexpected error occurred.", variant: "destructive" });
          return false;
      } finally { setIsLoading(false); }
  }, [user, toast, selectedProperty, selectProperty]); // Added selectedProperty and selectProperty

  // --- Refresh Wrapper ---
  // Defined outside the primary useEffect to be callable externally (e.g., by CRUD operations)
  // It now directly calls the loadUserDataAndProperties logic if the user exists
  const refreshProperties = useCallback(async (triggeredBy = 'manual') => {
      const currentUserId = user?.id;
      console.log(`PropertyContext: Manual refresh triggered by: ${triggeredBy}. User: ${currentUserId}`);
      if (currentUserId) {
          // Re-run the fetch logic defined within the main useEffect scope implicitly
          // by updating a dependency (though user?.id doesn't change here).
          // A more direct way might be needed if the effect logic isn't re-running.
          // For now, let's assume the state updates from CRUD might trigger downstream effects,
          // or we manually call the load logic again.
          // Option: Redefine loadUserDataAndProperties outside and call it here. Let's stick with the current flow for now.
          // The initial fetch logic will run again if the component re-renders and user.id is stable.
          // To force it, we could add a counter state updated by refreshProperties, but let's avoid complexity first.
          // Let's assume for now that calling this is sufficient to signal intent to refresh.
           setIsLoading(true); // Show loading during manual refresh
           // Re-fetch manually ( duplicating logic - less ideal, but direct)
           // This is needed because the main useEffect won't re-run just because refreshProperties is called.
            if (user?.id) {
                // Copied from inside useEffect - needs refactoring later to avoid duplication
                try {
                    const userId = user.id;
                    // Fetch memberships...
                    const { data: memberships, error: membershipError } = await supabase.from('property_members').select('property_id').eq('user_id', userId);
                    if (membershipError) throw membershipError;
                    if (!memberships || memberships.length === 0) { setProperties([]); setSelectedProperty(null); setPropertyMembers([]); setStoredPropertyId(null); setIsLoading(false); return; }
                    // Fetch properties...
                    const propertyIds = memberships.map(member => member.property_id);
                    const { data: propertiesData, error: propertiesError } = await supabase.from('properties').select('*').in('id', propertyIds);
                    if (propertiesError) throw propertiesError;
                    const sortedProperties = (propertiesData || []).sort((a, b) => a.name.localeCompare(b.name));
                    setProperties(sortedProperties);
                    // Fetch members & profiles...
                    let enrichedMembers: PropertyMemberWithProfile[] = [];
                     if (sortedProperties.length > 0) {
                         const { data: allMembersData, error: membersError } = await supabase.from('property_members').select('*').in('property_id', propertyIds);
                         if (membersError) throw membersError;
                         const allMembers = allMembersData || [];
                         if (allMembers.length > 0) {
                             const uniqueUserIds = [...new Set(allMembers.map(m => m.user_id))];
                             const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('*').in('id', uniqueUserIds);
                             if (profilesError) { console.error("Refresh Error fetching profiles:", profilesError); enrichedMembers = allMembers.map(member => ({ ...member, profile: null })); }
                             else { const profileMap = new Map((profilesData || []).map(p => [p.id, p])); enrichedMembers = allMembers.map(member => ({ ...member, profile: profileMap.get(member.user_id) || null })); }
                         }
                     }
                    setPropertyMembers(enrichedMembers);
                    // Re-evaluate selection (important after delete/create)
                    let propertyToSelect: Property | null = null;
                    const savedPropertyId = getStoredPropertyId();
                    if (savedPropertyId) { const savedProperty = sortedProperties.find(p => p.id === savedPropertyId); if (savedProperty) { propertyToSelect = savedProperty; } else { setStoredPropertyId(null); } }
                    if (!propertyToSelect && sortedProperties.length > 0) { propertyToSelect = sortedProperties[0]; }
                    // Use functional update for selection after refresh
                    setSelectedProperty(currentSelection => { const newSelectionId = propertyToSelect?.id ?? null; if(newSelectionId !== currentSelection?.id){ setStoredPropertyId(newSelectionId); return propertyToSelect; } return currentSelection; });

                } catch (err: any) { console.error("Error during manual refresh:", err); toast({ title: "Refresh Error", description: err.message, variant: "destructive" }); /* Keep existing state */ }
                 finally { setIsLoading(false); }
            } else {
                setIsLoading(false); // No user, stop loading
            }


      } else {
          console.log("PropertyContext: Refresh called but no user session.");
      }
  }, [user?.id, toast]); // Depend on user ID and toast


  // --- Context Provider Value ---
  return (
    <PropertyContext.Provider value={{
      selectedProperty, properties, propertyMembers,
      isLoading, error,
      selectProperty, refreshProperties, createProperty, updateProperty, deleteProperty
    }}>
      {children}
    </PropertyContext.Provider>
  );
}

// --- Custom Hook ---
export const useProperty = () => {
  const context = useContext(PropertyContext);
  if (context === undefined) { throw new Error('useProperty must be used within a PropertyProvider'); }
  return context;
};