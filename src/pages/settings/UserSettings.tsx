
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/contexts/PropertyContext";

const UserSettings = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedProperty } = useProperty();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    avatarUrl: "",
  });
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  
  const [propertyForm, setPropertyForm] = useState({
    name: "",
    type: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    description: "",
  });
  
  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (error) throw error;
        
        if (data) {
          setProfileForm({
            firstName: data.first_name || "",
            lastName: data.last_name || "",
            email: data.email || "",
            phone: data.phone || "",
            avatarUrl: data.avatar_url || "",
          });
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast({
          title: "Error",
          description: "Failed to load profile data",
          variant: "destructive",
        });
      }
    };
    
    fetchProfile();
  }, [user]);
  
  // Fetch property data if selected
  useEffect(() => {
    if (selectedProperty) {
      setPropertyForm({
        name: selectedProperty.name,
        type: selectedProperty.type,
        address: selectedProperty.address,
        city: selectedProperty.city,
        state: selectedProperty.state,
        zipCode: selectedProperty.zip_code,
        country: selectedProperty.country,
        description: selectedProperty.description || "",
      });
    }
  }, [selectedProperty]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handlePropertyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPropertyForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!user) throw new Error("User not authenticated");
      
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profileForm.firstName,
          last_name: profileForm.lastName,
          phone: profileForm.phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
        
      if (error) throw error;
      
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "There was a problem updating your profile.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });
        
      if (error) throw error;
      
      toast({
        title: "Password Updated",
        description: "Your password has been updated successfully.",
      });
      
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      console.error("Error updating password:", error);
      toast({
        title: "Error",
        description: error.message || "There was a problem updating your password.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePropertySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProperty) {
      toast({
        title: "No Property Selected",
        description: "Please select a property first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase
        .from('properties')
        .update({
          name: propertyForm.name,
          type: propertyForm.type,
          address: propertyForm.address,
          city: propertyForm.city,
          state: propertyForm.state,
          zip_code: propertyForm.zipCode,
          country: propertyForm.country,
          description: propertyForm.description || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedProperty.id);
        
      if (error) throw error;
      
      toast({
        title: "Property Updated",
        description: "Property details have been updated successfully.",
      });
    } catch (error: any) {
      console.error("Error updating property:", error);
      toast({
        title: "Error",
        description: "There was a problem updating the property details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    if (!user) return;
    
    const file = e.target.files[0];
    if (file.size > 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Avatar image must be less than 1MB",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `avatars/${user.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);
        
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
        
      const avatarUrl = urlData.publicUrl;
      
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);
        
      if (updateError) throw updateError;
      
      // Update local state
      setProfileForm(prev => ({
        ...prev,
        avatarUrl,
      }));
      
      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated successfully.",
      });
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast({
        title: "Error",
        description: "Failed to update avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-serif font-bold text-navy-900 mb-2">
          Account Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your personal information and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-8">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          {selectedProperty && (
            <TabsTrigger value="property">Property Settings</TabsTrigger>
          )}
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <form onSubmit={handleProfileSubmit}>
              <CardHeader>
                <CardTitle className="font-serif">Personal Information</CardTitle>
                <CardDescription>
                  Update your personal details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profileForm.avatarUrl} />
                    <AvatarFallback className="text-lg">
                      {profileForm.firstName && profileForm.lastName 
                        ? `${profileForm.firstName.charAt(0)}${profileForm.lastName.charAt(0)}`
                        : user?.email?.charAt(0).toUpperCase()
                      }
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label htmlFor="avatar-upload" className="cursor-pointer">
                      <div className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2">
                        {isUploading ? "Uploading..." : "Upload Photo"}
                      </div>
                      <Input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                        disabled={isUploading}
                      />
                    </Label>
                    <p className="text-xs text-muted-foreground mt-2">
                      JPG, GIF or PNG. Max size of 1MB.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={profileForm.firstName}
                      onChange={handleProfileChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={profileForm.lastName}
                      onChange={handleProfileChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={profileForm.email}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email address cannot be changed
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={handleProfileChange}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t p-6">
                <Button
                  type="submit"
                  className="bg-navy-900 hover:bg-navy-800"
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* Password Tab */}
        <TabsContent value="password">
          <Card>
            <form onSubmit={handlePasswordSubmit}>
              <CardHeader>
                <CardTitle className="font-serif">Change Password</CardTitle>
                <CardDescription>
                  Update your password
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={handlePasswordChange}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one lowercase letter.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t p-6">
                <Button
                  type="submit"
                  className="bg-navy-900 hover:bg-navy-800"
                  disabled={isLoading}
                >
                  {isLoading ? "Updating..." : "Update Password"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
        
        {/* Property Settings Tab */}
        {selectedProperty && (
          <TabsContent value="property">
            <Card>
              <form onSubmit={handlePropertySubmit}>
                <CardHeader>
                  <CardTitle className="font-serif">Property Settings</CardTitle>
                  <CardDescription>
                    Update details for {selectedProperty.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Property Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={propertyForm.name}
                      onChange={handlePropertyChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="type">Property Type</Label>
                    <Input
                      id="type"
                      name="type"
                      value={propertyForm.type}
                      onChange={handlePropertyChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      name="description"
                      value={propertyForm.description}
                      onChange={handlePropertyChange}
                    />
                  </div>
                  
                  <div className="grid gap-4">
                    <Label>Address</Label>
                    
                    <div className="space-y-2">
                      <Label htmlFor="address" className="text-sm text-muted-foreground">Street Address</Label>
                      <Input
                        id="address"
                        name="address"
                        value={propertyForm.address}
                        onChange={handlePropertyChange}
                        required
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city" className="text-sm text-muted-foreground">City</Label>
                        <Input
                          id="city"
                          name="city"
                          value={propertyForm.city}
                          onChange={handlePropertyChange}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state" className="text-sm text-muted-foreground">State/Province</Label>
                        <Input
                          id="state"
                          name="state"
                          value={propertyForm.state}
                          onChange={handlePropertyChange}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="zipCode" className="text-sm text-muted-foreground">ZIP/Postal Code</Label>
                        <Input
                          id="zipCode"
                          name="zipCode"
                          value={propertyForm.zipCode}
                          onChange={handlePropertyChange}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country" className="text-sm text-muted-foreground">Country</Label>
                        <Input
                          id="country"
                          name="country"
                          value={propertyForm.country}
                          onChange={handlePropertyChange}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end border-t p-6">
                  <Button
                    type="submit"
                    className="bg-navy-900 hover:bg-navy-800"
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : "Save Property"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        )}

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Notification Settings</CardTitle>
              <CardDescription>
                Configure how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center py-8 text-muted-foreground">
                Notification settings will be implemented in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserSettings;
