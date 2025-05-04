// src/pages/co-owners/CoOwnersPage.tsx
// v4 - Corrected props passed to EditMemberRoleDialog: Convert MemberRoleType to MemberRole enum.

import React, { useEffect } from 'react';
import { useCoOwner } from '@/contexts/CoOwnerContext';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, UserPlus, Edit, Trash2, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import { InviteMemberDialog } from '@/components/co-owners/InviteMemberDialog';
import { EditMemberRoleDialog } from '@/components/co-owners/EditMemberRoleDialog';
import { ConfirmRemoveMemberDialog } from '@/components/co-owners/ConfirmRemoveMemberDialog';
import { MemberRole, MemberRoleType } from '@/integrations/supabase/types'; // Import Enum and Type Alias

// Helper function to map Type Alias string to Enum value
const mapMemberRoleTypeToEnum = (roleType: MemberRoleType | null | undefined): MemberRole | null => {
    if (!roleType) return null;
    switch (roleType) {
        case 'owner': return MemberRole.Owner;
        case 'co_owner': return MemberRole.CoOwner;
        case 'guest': return MemberRole.Guest;
        default: return null; // Or handle unknown types appropriately
    }
};

export function CoOwnersPage() {
  const { selectedProperty } = useProperty();
  const {
    members,
    isLoadingMembers,
    isLoadingAction,
    currentUserRole, // This is already MemberRole enum from context internal logic
    canInvite,
    canEditRole,
    canRemoveMember,
  } = useCoOwner();

  const propertyName = selectedProperty?.name ?? 'Property';

  useEffect(() => {
    document.title = `Co-Owners | CoHaven`;
  }, []);

  const getDisplayName = (profile: { first_name?: string | null; last_name?: string | null; email?: string | null } | null): string => {
    if (!profile) return 'Unknown User';
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    return name || profile.email || 'Unnamed User';
  };

  const formatRole = (role: string | null | undefined): string => {
    if (!role) return 'N/A';
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };


  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Co-Owners</h1>
         <InviteMemberDialog
           trigger={
             <Button disabled={!canInvite || isLoadingAction} size="sm">
               {isLoadingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
               Invite Member
             </Button>
           }
         />
      </div>


      <Card>
        <CardHeader>
          <CardTitle>{propertyName} Members</CardTitle>
          <CardDescription>Manage members and their roles for this property.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingMembers && !members.length ? (
             <div className="flex justify-center items-center py-10">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Avatar</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && !isLoadingMembers && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No members found for this property. Invite one!
                  </TableCell>
                </TableRow>
              )}
              {members.map((member) => {
                const displayName = getDisplayName(member.profile);
                const memberCanBeEdited = canEditRole(member.user_id);
                const memberCanBeRemoved = canRemoveMember(member.user_id);
                // --- FIX: Convert role type alias to enum before passing ---
                const currentRoleEnum = mapMemberRoleTypeToEnum(member.role);

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.profile?.avatar_url ?? undefined} alt={displayName} />
                        <AvatarFallback>{getInitials(member.profile?.first_name ?? displayName)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{member.profile?.email ?? 'N/A'}</TableCell>
                    <TableCell>
                       {/* Display uses the original string type alias */}
                      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                         {formatRole(member.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(memberCanBeEdited || memberCanBeRemoved) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" disabled={isLoadingAction}>
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                             {memberCanBeEdited && (
                                <EditMemberRoleDialog
                                    memberId={member.id}
                                    // --- FIX: Pass the converted enum value ---
                                    currentRole={currentRoleEnum}
                                    trigger={
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            <span>Edit Role</span>
                                        </DropdownMenuItem>
                                    }
                                />
                             )}
                             {memberCanBeRemoved && (
                                <ConfirmRemoveMemberDialog
                                    memberId={member.id}
                                    memberName={displayName}
                                    trigger={
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            <span>Remove Member</span>
                                        </DropdownMenuItem>
                                    }
                                />
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-muted-foreground"></span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}