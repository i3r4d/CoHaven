// src/contexts/CoOwnerContext.tsx
// v2 - Adjusted invite success toast message.

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PropertyMemberWithProfile, MemberRole, Database } from '@/integrations/supabase/types';

// Define the shape of the context data
interface CoOwnerContextType {
  members: PropertyMemberWithProfile[]; // Members of the *selected* property
  isLoadingMembers: boolean; // Loading state from PropertyContext
  currentUserRole: MemberRole | null; // Current user's role for the selected property
  canInvite: boolean; // Can the current user invite?
  canEditRole: (memberUserId: string) => boolean; // Can the current user edit a specific member's role? // Changed param name for clarity
  canRemoveMember: (memberUserId: string) => boolean; // Can the current user remove a specific member? // Changed param name for clarity
  inviteMember: (email: string, role: MemberRole) => Promise<void>;
  updateMemberRole: (memberId: string, newRole: MemberRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  isLoadingAction: boolean; // Loading state for invite/update/remove actions
  error: string | null; // Error state for actions
}

// Create the context
const CoOwnerContext = createContext<CoOwnerContextType | undefined>(undefined);

// Define the provider component
export function CoOwnerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { selectedProperty, propertyMembers: allPropertyMembers, isLoading: isLoadingProperties, refreshProperties } = useProperty();
  const { toast } = useToast();

  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtered Members for Selected Property
  const members = useMemo(() => {
    if (!selectedProperty) return [];
    return allPropertyMembers.filter(m => m.property_id === selectedProperty.id);
  }, [selectedProperty, allPropertyMembers]);

  // Current User's Role
  const currentUserRole = useMemo(() => {
    if (!user || !selectedProperty || members.length === 0) return null;
    const currentUserMemberInfo = members.find(m => m.user_id === user.id);
    // Ensure role is correctly typed from MemberRole enum/type alias
    return currentUserMemberInfo?.role as MemberRole ?? null;
  }, [user, selectedProperty, members]);

  // Permissions
  const canInvite = useMemo(() => {
    return currentUserRole === MemberRole.Owner || currentUserRole === MemberRole.CoOwner;
  }, [currentUserRole]);

  const canEditRole = useCallback((memberUserId: string): boolean => {
    if (currentUserRole !== MemberRole.Owner) return false;
    if (memberUserId === user?.id) return false;
    const targetMember = members.find(m => m.user_id === memberUserId);
    if (!targetMember) return false;
    // Owner can edit co-owner or guest roles
    return targetMember.role === MemberRole.CoOwner || targetMember.role === MemberRole.Guest;
  }, [currentUserRole, user?.id, members]);

  const canRemoveMember = useCallback((memberUserId: string): boolean => {
    if (currentUserRole !== MemberRole.Owner) return false;
    if (memberUserId === user?.id) return false;
    const targetMember = members.find(m => m.user_id === memberUserId);
    if (!targetMember) return false;
    // Owner cannot remove another owner
    return targetMember.role !== MemberRole.Owner;
  }, [currentUserRole, user?.id, members]);

  // Actions
  const inviteMember = useCallback(async (email: string, role: MemberRole) => {
    if (!selectedProperty || !canInvite) {
      toast({ title: "Permission Denied", description: "You do not have permission to invite members.", variant: "destructive" });
      return;
    }
    setIsLoadingAction(true);
    setError(null);
    console.log(`Attempting to invite ${email} as ${role} to property ${selectedProperty.id}`);

    try {
      const { data, error: rpcError } = await supabase.rpc('invite_property_member', {
         p_property_id: selectedProperty.id,
         p_invitee_email: email,
         p_role: role
      });

      if (rpcError) throw rpcError;
      if (data && 'error' in data) throw new Error(data.error);
      if (!data || !('member_id' in data)) throw new Error("Failed to invite member or unexpected response.");

      // --- FIX: Adjusted success toast message ---
      toast({ title: "Member Added", description: `${email} has been added as a ${role}.` });
      await refreshProperties('inviteMember'); // Refresh properties/members list
    } catch (err: any) {
      console.error("Error inviting member:", err);
      const message = err.message || "An unexpected error occurred.";
      setError(message);
      toast({ title: "Invitation Failed", description: message, variant: "destructive" });
    } finally {
      setIsLoadingAction(false);
    }
  }, [selectedProperty, canInvite, refreshProperties, toast]);

  const updateMemberRole = useCallback(async (memberId: string, newRole: MemberRole) => {
    const memberToUpdate = members.find(m => m.id === memberId);
    if (!memberToUpdate || !canEditRole(memberToUpdate.user_id)) {
        toast({ title: "Permission Denied", description: "You cannot edit this member's role.", variant: "destructive" });
        return;
    }
    setIsLoadingAction(true);
    setError(null);
    console.log(`Attempting to update member ${memberId} to role ${newRole}`);
    try {
       const { error: rpcError } = await supabase.rpc('update_property_member_role', {
            p_property_member_id: memberId,
            p_new_role: newRole
        });
       if (rpcError) throw rpcError;
       toast({ title: "Success", description: "Member role updated." });
       await refreshProperties('updateMemberRole');
    } catch (err: any) {
      console.error("Error updating member role:", err);
      const message = err.message || "An unexpected error occurred.";
      setError(message);
      toast({ title: "Update Failed", description: message, variant: "destructive" });
    } finally {
      setIsLoadingAction(false);
    }
  }, [members, canEditRole, refreshProperties, toast]);

  const removeMember = useCallback(async (memberId: string) => {
    const memberToRemove = members.find(m => m.id === memberId);
     if (!memberToRemove || !canRemoveMember(memberToRemove.user_id)) {
        toast({ title: "Permission Denied", description: "You cannot remove this member.", variant: "destructive" });
        return;
     }
    setIsLoadingAction(true);
    setError(null);
    console.log(`Attempting to remove member ${memberId}`);
    try {
       const { error: rpcError } = await supabase.rpc('remove_property_member', {
           p_property_member_id: memberId
       });
       if (rpcError) throw rpcError;
       toast({ title: "Success", description: "Member removed." });
       await refreshProperties('removeMember');
    } catch (err: any) {
      console.error("Error removing member:", err);
      const message = err.message || "An unexpected error occurred.";
      setError(message);
      toast({ title: "Removal Failed", description: message, variant: "destructive" });
    } finally {
      setIsLoadingAction(false);
    }
  }, [members, canRemoveMember, refreshProperties, toast]);

  // Context Value
  const value = useMemo(() => ({
    members,
    isLoadingMembers: isLoadingProperties,
    currentUserRole,
    canInvite,
    canEditRole,
    canRemoveMember,
    inviteMember,
    updateMemberRole,
    removeMember,
    isLoadingAction,
    error,
  }), [
      members, isLoadingProperties, currentUserRole, canInvite, canEditRole, canRemoveMember,
      inviteMember, updateMemberRole, removeMember, isLoadingAction, error
  ]);

  return (
    <CoOwnerContext.Provider value={value}>
      {children}
    </CoOwnerContext.Provider>
  );
}

// Custom Hook
export const useCoOwner = () => {
  const context = useContext(CoOwnerContext);
  if (context === undefined) {
    throw new Error('useCoOwner must be used within a CoOwnerProvider');
  }
  return context;
};