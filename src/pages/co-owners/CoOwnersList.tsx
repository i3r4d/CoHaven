
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  PlusIcon,
  UserPlusIcon,
  MailIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProperty } from "@/contexts/PropertyContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from '@/integrations/supabase/types';

type PropertyMember = Database['public']['Tables']['property_members']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type MemberRole = Database['public']['Enums']['member_role'];

interface MemberWithProfile extends PropertyMember {
  profile?: Profile;
}

const CoOwnersList = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedProperty, propertyMembers, refreshProperties } = useProperty();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    role: "co_owner" as MemberRole,
    ownership_percentage: "0",
  });
  
  useEffect(() => {
    const fetchMembers = async () => {
      if (!selectedProperty) {
        setMembers([]);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const filteredMembers = propertyMembers.filter(
          member => member.property_id === selectedProperty.id
        );
        
        const userIds = filteredMembers.map(member => member.user_id);
        
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);
            
          if (profilesError) throw profilesError;
          
          const profilesMap: Record<string, Profile> = {};
          profilesData?.forEach(profile => {
            profilesMap[profile.id] = profile;
          });
          
          setProfiles(profilesMap);
          
          const membersWithProfiles = filteredMembers.map(member => ({
            ...member,
            profile: profilesMap[member.user_id]
          }));
          
          setMembers(membersWithProfiles);
        } else {
          setMembers([]);
        }
      } catch (error: any) {
        console.error("Error fetching co-owners:", error);
        toast({
          title: "Error",
          description: "Failed to load co-owners",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMembers();
  }, [selectedProperty, propertyMembers]);
  
  useEffect(() => {
    if (!isDialogOpen) {
      setFormData({
        email: "",
        role: "co_owner",
        ownership_percentage: "0",
      });
      setIsEmailValid(false);
    }
  }, [isDialogOpen]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (name === 'email') {
      setIsEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    }
  };
  
  const handleSelectChange = (name: string, value: MemberRole) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleCheckEmail = async () => {
    if (!isEmailValid) return;
    
    setIsAdding(true);
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', formData.email)
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') {
          toast({
            title: "User not found",
            description: "No user with this email exists. They must sign up first.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else if (data) {
        const existingMember = members.find(member => member.user_id === data.id);
        
        if (existingMember) {
          toast({
            title: "Already a member",
            description: "This user is already a member of this property.",
            variant: "destructive",
          });
          return;
        }
        
        await addMember(data.id);
      }
    } catch (error: any) {
      console.error("Error checking email:", error);
      toast({
        title: "Error",
        description: "Failed to check email",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };
  
  const addMember = async (userId: string) => {
    if (!selectedProperty) return;
    
    try {
      const memberData = {
        property_id: selectedProperty.id,
        user_id: userId,
        role: formData.role,
        ownership_percentage: parseFloat(formData.ownership_percentage) || 0,
      };
      
      const { error } = await supabase
        .from('property_members')
        .insert(memberData);
        
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Co-owner added successfully.",
      });
      
      await refreshProperties();
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("Error adding member:", error);
      toast({
        title: "Error",
        description: "Failed to add co-owner",
        variant: "destructive",
      });
    }
  };
  
  const handleUpdateRole = async (member: MemberWithProfile, newRole: MemberRole) => {
    try {
      const { error } = await supabase
        .from('property_members')
        .update({ role: newRole })
        .eq('id', member.id);
        
      if (error) throw error;
      
      setMembers(members.map(m => 
        m.id === member.id ? { ...m, role: newRole } : m
      ));
      
      toast({
        title: "Success",
        description: `Role updated to ${newRole.replace('_', ' ')}.`,
      });
      
      await refreshProperties();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update role",
        variant: "destructive",
      });
    }
  };
  
  const handleUpdateOwnership = async (member: MemberWithProfile, percentage: string) => {
    const numPercentage = parseFloat(percentage);
    
    if (isNaN(numPercentage) || numPercentage < 0 || numPercentage > 100) {
      toast({
        title: "Invalid percentage",
        description: "Ownership percentage must be between 0 and 100.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('property_members')
        .update({ ownership_percentage: numPercentage })
        .eq('id', member.id);
        
      if (error) throw error;
      
      setMembers(members.map(m => 
        m.id === member.id ? { ...m, ownership_percentage: numPercentage } : m
      ));
      
      toast({
        title: "Success",
        description: `Ownership percentage updated to ${numPercentage}%.`,
      });
      
      await refreshProperties();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update ownership percentage",
        variant: "destructive",
      });
    }
  };
  
  const handleRemoveMember = async (member: MemberWithProfile) => {
    if (!window.confirm(`Are you sure you want to remove ${member.profile?.first_name} ${member.profile?.last_name} from this property?`)) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('property_members')
        .delete()
        .eq('id', member.id);
        
      if (error) throw error;
      
      setMembers(members.filter(m => m.id !== member.id));
      
      toast({
        title: "Success",
        description: "Member removed successfully.",
      });
      
      await refreshProperties();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive",
      });
    }
  };
  
  const getInitials = (profile?: Profile) => {
    if (!profile) return "??";
    return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`;
  };
  
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'co_owner': return 'bg-blue-100 text-blue-800';
      case 'guest': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const isUserOwner = () => {
    if (!user) return false;
    return members.some(member => 
      member.user_id === user.id && member.role === 'owner'
    );
  };
  
  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder = { owner: 0, co_owner: 1, guest: 2 };
    return (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
  });

  if (!selectedProperty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-xl font-serif font-medium mb-2">
            No Property Selected
          </h3>
          <p className="text-muted-foreground mb-6">
            Please select or create a property to manage co-owners
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
        <h1 className="text-3xl font-serif font-bold text-navy-900">Co-Owners</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="bg-navy-900 hover:bg-navy-800"
              disabled={!isUserOwner()}
            >
              <UserPlusIcon className="mr-2 h-4 w-4" />
              Add Co-Owner
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="font-serif">Add Co-Owner</DialogTitle>
              <DialogDescription>
                Invite someone to co-own {selectedProperty?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      placeholder="email@example.com"
                      className="pl-10"
                      value={formData.email}
                      onChange={handleInputChange}
                      type="email"
                    />
                  </div>
                  <Button 
                    onClick={handleCheckEmail}
                    disabled={!isEmailValid || isAdding}
                    className="bg-navy-900 hover:bg-navy-800"
                  >
                    {isAdding ? "Checking..." : "Add User"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The user must already have an account on CoHaven
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value: MemberRole) => handleSelectChange("role", value)}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="co_owner">Co-Owner</SelectItem>
                      <SelectItem value="guest">Guest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ownership_percentage">Ownership %</Label>
                  <div className="relative">
                    <Input
                      id="ownership_percentage"
                      name="ownership_percentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formData.ownership_percentage}
                      onChange={handleInputChange}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Property Members</CardTitle>
          <CardDescription>
            Manage co-owners and guests for {selectedProperty?.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center p-4 rounded-lg border animate-pulse">
                  <div className="h-12 w-12 bg-gray-200 rounded-full mr-4"></div>
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  </div>
                  <div className="h-8 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : sortedMembers.length > 0 ? (
            <div className="space-y-4">
              {sortedMembers.map((member) => (
                <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center mb-4 sm:mb-0">
                    <Avatar className="h-12 w-12 mr-4">
                      <AvatarImage src={member.profile?.avatar_url || ""} alt={member.profile?.first_name || "User"} />
                      <AvatarFallback className="bg-navy-100 text-navy-700">
                        {getInitials(member.profile)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center">
                        <h3 className="font-medium mr-2">
                          {member.profile?.first_name} {member.profile?.last_name}
                          {member.user_id === user?.id && " (You)"}
                        </h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getRoleColor(member.role)}`}>
                          {member.role.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{member.profile?.email}</p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Ownership:</span> {parseFloat(member.ownership_percentage.toString())}%
                      </p>
                    </div>
                  </div>
                  
                  {isUserOwner() && (
                    <div className="flex flex-wrap gap-2">
                      <Select 
                        value={member.role} 
                        onValueChange={(value: MemberRole) => handleUpdateRole(member, value)}
                        disabled={member.user_id === user?.id}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="co_owner">Co-Owner</SelectItem>
                          <SelectItem value="guest">Guest</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <div className="relative h-8 w-[90px]">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="h-8 pr-6"
                          value={member.ownership_percentage.toString()}
                          onChange={(e) => handleUpdateOwnership(member, e.target.value)}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                          %
                        </span>
                      </div>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => handleRemoveMember(member)}
                        disabled={member.role === 'owner' && member.user_id === user?.id}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No co-owners found. Add co-owners to share your property.
            </div>
          )}
        </CardContent>
        {!isUserOwner() && (
          <CardFooter className="border-t p-4">
            <p className="text-sm text-muted-foreground text-center w-full">
              Only the property owner can add or modify co-owners.
            </p>
          </CardFooter>
        )}
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Ownership Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block text-navy-900">
                  Ownership Distribution
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold inline-block text-navy-900">
                  {members.reduce((sum, member) => sum + parseFloat(member.ownership_percentage.toString()), 0).toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
              {members.map((member, index) => (
                <div
                  key={member.id}
                  style={{ width: `${parseFloat(member.ownership_percentage.toString())}%` }}
                  className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                    index % 4 === 0 ? 'bg-navy-900' : 
                    index % 4 === 1 ? 'bg-navy-700' : 
                    index % 4 === 2 ? 'bg-navy-500' : 
                    'bg-navy-300'
                  }`}
                ></div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {sortedMembers.map((member, index) => (
                <div key={member.id} className="flex items-center">
                  <div className={`h-3 w-3 mr-2 rounded-sm ${
                    index % 4 === 0 ? 'bg-navy-900' : 
                    index % 4 === 1 ? 'bg-navy-700' : 
                    index % 4 === 2 ? 'bg-navy-500' : 
                    'bg-navy-300'
                  }`}></div>
                  <div className="text-xs">
                    {member.profile?.first_name} {member.profile?.last_name?.charAt(0)}.
                    {" - "}
                    {parseFloat(member.ownership_percentage.toString()).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CoOwnersList;
