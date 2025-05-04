// src/pages/properties/PropertyList.tsx
// v4 - Simplified Unsplash keywords to single terms to potentially resolve 404 errors.

import React, { useState } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  PlusIcon,
  PackageOpen,
  Pencil,
  MoreVertical,
  Trash2,
  Users,
  Loader2
} from "lucide-react";
import { useProperty } from "@/contexts/PropertyContext";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { cn } from "@/lib/utils";
import { Database, Property, Profile, PropertyMemberWithProfile } from "@/integrations/supabase/types";
import { Skeleton } from '@/components/ui/skeleton';


// --- Define Property Types and Image Map ---
const propertyTypes = [
    "Vacation Home",
    "Family Cabin",
    "Beach House",
    "Mountain Retreat",
    "Lakefront Property",
    "Urban Apartment",
    "Investment Property",
    "Inherited Estate",
    "Other"
] as const;

type KnownPropertyType = typeof propertyTypes[number];

// --- Mapping with SIMPLIFIED keywords ---
const propertyTypeImageMap: Record<KnownPropertyType, string> = {
    "Vacation Home": "https://images.unsplash.com/photo-1711114378455-b1f479d94a19?q=80&w=1548&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Family Cabin": "https://images.unsplash.com/photo-1595521624992-48a59aef95e3?q=80&w=1587&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Beach House": "https://images.unsplash.com/photo-1544143086-828f66ac3945?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Mountain Retreat": "https://images.unsplash.com/photo-1583878594798-c31409c8ab4a?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Lakefront Property": "https://images.unsplash.com/photo-1592608253110-7a607300e379?q=80&w=1548&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Urban Apartment": "https://plus.unsplash.com/premium_photo-1664266386277-2789b93c8b53?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Investment Property": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // Might be less specific
    "Inherited Estate": "https://images.unsplash.com/photo-1578736064666-bfe47265d6b1?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "Other": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?q=80&w=1548&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
};

// --- Default URL with SIMPLIFIED keyword ---
const defaultPropertyImageUrl = "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1475&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

const getImageUrlForType = (type: Property['type'] | null | undefined): string => {
  const knownType = propertyTypes.includes(type as KnownPropertyType) ? type as KnownPropertyType : null;
  return knownType ? propertyTypeImageMap[knownType] : defaultPropertyImageUrl;
};

const getInitials = (firstName?: string | null, lastName?: string | null): string => {
    const firstInitial = firstName?.charAt(0) ?? '';
    const lastInitial = lastName?.charAt(0) ?? '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
};

const PropertyList = () => {
  const {
    properties, isLoading, propertyMembers,
    selectedProperty, deleteProperty
   } = useProperty();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEditClick = (propertyId: string) => {
    navigate(`/properties/${propertyId}/edit`);
  };

  const handleDeleteClick = (property: Property, e: React.MouseEvent) => {
    e.stopPropagation();
    setPropertyToDelete(property);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!propertyToDelete) return;
    setIsDeleting(true);
    await deleteProperty(propertyToDelete.id);
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setPropertyToDelete(null);
  };

  const formatFullAddress = (property: Property): string => {
      const addressPart = property.address || '';
      const cityPart = property.city || '';
      const statePart = property.state || '';
      const zipPart = property.zip_code || '';
      let cityStateZip = '';

      if (cityPart) { cityStateZip += cityPart; }
      if (statePart) { cityStateZip += (cityPart ? ', ' : '') + statePart; }
      if (zipPart) { cityStateZip += (cityPart || statePart ? ' ' : '') + zipPart; }

      const parts = [addressPart, cityStateZip.trim()].filter(Boolean);
      return parts.join(', ');
  };

  if (isLoading) {
     return (
         <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
             <div className="flex justify-between items-center">
                 <h1 className="text-2xl lg:text-3xl font-poppins font-bold text-gray-800">My Properties</h1>
                 <Link to="/properties/new"><Button><PlusIcon className="mr-2 h-4 w-4" />Add Property</Button></Link>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {[1, 2, 3].map((i) => (
                     <Card key={i} className="overflow-hidden animate-pulse bg-white shadow-md rounded-lg flex flex-col">
                         <div className="aspect-video bg-muted"></div>
                         <CardHeader className="p-4 pb-2">
                             <Skeleton className="h-6 w-3/4 mb-1"/>
                             <Skeleton className="h-4 w-full"/>
                         </CardHeader>
                         <CardContent className="p-4 pt-0 flex-grow">
                             <Skeleton className="h-4 w-2/3"/>
                         </CardContent>
                         <CardFooter className="p-4 border-t bg-muted/30">
                             <Skeleton className="h-8 w-full"/>
                         </CardFooter>
                     </Card>
                 ))}
             </div>
         </div>
     );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl lg:text-3xl font-poppins font-bold text-gray-800">My Properties</h1>
        <Link to="/properties/new">
            <Button><PlusIcon className="mr-2 h-4 w-4" />Add Property</Button>
        </Link>
      </div>

      {properties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property: Property) => {
            const isSelected = selectedProperty?.id === property.id;
            const imageUrl = getImageUrlForType(property.type);

            const membersForThisProperty = propertyMembers.filter(
                (m: PropertyMemberWithProfile) => m.property_id === property.id
            );
            const profiles = membersForThisProperty
                .map((member: PropertyMemberWithProfile) => member.profile)
                .filter((p): p is Profile => p !== null && p !== undefined);

            const fullAddress = formatFullAddress(property);

            return (
              <Card
                key={property.id}
                className={cn(
                  "overflow-hidden bg-white shadow-md rounded-lg transition-all duration-200 ease-in-out flex flex-col hover:shadow-lg hover:scale-[1.02]",
                  isSelected && "ring-2 ring-primary ring-offset-2"
                )}
              >
                <div className="aspect-video w-full relative bg-muted">
                   <img
                        src={imageUrl} // Uses the simplified URLs now
                        alt={`Image representing a ${property.type || 'property'} - ${property.name}`}
                        crossOrigin="anonymous" // Keep this just in case
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            if (target.src !== defaultPropertyImageUrl) {
                                console.warn(`Failed to load image for type ${property.type}. Falling back to default.`);
                                target.src = defaultPropertyImageUrl;
                                target.alt = `Default placeholder image - ${property.name}`;
                            } else {
                                console.error(`Failed to load default image: ${defaultPropertyImageUrl}`);
                            }
                        }}
                   />
                </div>
                <CardHeader className="p-4 pb-2 flex flex-row justify-between items-start space-x-2">
                   <div className="flex-1 min-w-0">
                        <CardTitle className="font-poppins font-semibold text-lg text-gray-900 truncate" title={property.name}>
                            {property.name}
                        </CardTitle>
                        <CardDescription className="text-sm font-inter text-gray-600 truncate" title={fullAddress}>
                            {fullAddress || 'Address not specified'}
                        </CardDescription>
                   </div>
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                       <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-700 flex-shrink-0 h-8 w-8">
                         <MoreVertical className="h-4 w-4" />
                         <span className="sr-only">Options</span>
                       </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <DropdownMenuItem onClick={() => handleEditClick(property.id)}>
                            <Pencil className="mr-2 h-4 w-4" /><span>Edit</span>
                       </DropdownMenuItem>
                       <DropdownMenuItem
                            onClick={(e) => handleDeleteClick(property, e)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" /><span>Delete</span>
                       </DropdownMenuItem>
                     </DropdownMenuContent>
                   </DropdownMenu>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex-grow">
                    <p className="text-xs font-inter text-gray-500 mb-1">
                        Added on {format(new Date(property.created_at), 'MMM d, yyyy')}
                    </p>
                </CardContent>
                <CardFooter className="p-3 border-t bg-muted/30">
                    <div className="flex items-center space-x-2">
                        <span className='text-xs text-gray-600 font-medium mr-1'>Co-owners:</span>
                        <div className="flex -space-x-2 overflow-hidden">
                            {profiles.length > 0 ? (
                                profiles.slice(0, 4).map(profile => (
                                    <Avatar key={profile.id} className="h-6 w-6 border-2 border-background">
                                        <AvatarImage src={profile.avatar_url ?? undefined} alt={`${profile.first_name ?? ''} ${profile.last_name ?? ''}`} />
                                        <AvatarFallback className="text-xs bg-gray-200">
                                            {getInitials(profile.first_name, profile.last_name)}
                                        </AvatarFallback>
                                    </Avatar>
                                ))
                            ) : (
                                <Avatar className="h-6 w-6 border-2 border-background">
                                    <AvatarFallback className="text-xs bg-gray-200">
                                        <Users className='h-3 w-3'/>
                                    </AvatarFallback>
                                </Avatar>
                            )}
                        </div>
                        {profiles.length > 4 && (
                            <span className="text-xs text-muted-foreground pl-1">+{profiles.length - 4} more</span>
                        )}
                        {profiles.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                    </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
         <div className="flex flex-col items-center justify-center text-center py-20">
            <PackageOpen className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-poppins font-semibold text-gray-800 mb-2">No Properties Yet</h3>
            <p className="text-muted-foreground font-inter mb-6 max-w-xs">
                It looks like you haven't added any properties. Get started by adding your first one!
            </p>
            <Link to="/properties/new">
                <Button size="lg"><PlusIcon className="mr-2 h-5 w-5" />Add Your First Property</Button>
            </Link>
         </div>
      )}

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the property "{propertyToDelete?.name}" and all associated data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeleteConfirm}
                        disabled={isDeleting}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        {isDeleting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                        ) : (
                            "Yes, delete property"
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
};

export default PropertyList;