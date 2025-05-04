// src/layouts/DashboardLayout.tsx
// v2 - Fixed sidebar active state logic for Properties/Co-owners.
//    - Fixed document title logic for Properties/Co-owners.

import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Building, CreditCard, Calendar, ClipboardList, FileText, Users, Settings, ChevronRight, Menu, LogOut, Repeat, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PropertySelector } from "@/components/PropertySelector";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useProperty } from "@/contexts/PropertyContext";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", path: "/dashboard", icon: Home },
  { name: "Properties", path: "/properties", icon: Building },
  { name: "Expenses", path: "/expenses", icon: CreditCard },
  { name: "Recurring", path: "/recurring-expenses", icon: Repeat },
  { name: "Calendar", path: "/calendar", icon: Calendar },
  { name: "Maintenance", path: "/maintenance", icon: ClipboardList },
  { name: "Documents", path: "/documents", icon: FileText },
  { name: "Co-owners", path: "/co-owners", icon: Users }, // Placeholder path for matching
  { name: "Settings", path: "/settings", icon: Settings },
];

const getUserInitials = (firstName?: string | null, lastName?: string | null): string => { // Added null check
    const firstInitial = firstName ? firstName.charAt(0) : '';
    const lastInitial = lastName ? lastName.charAt(0) : '';
    return (firstInitial + lastInitial).toUpperCase() || '?';
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const { isLoading: isPropertyLoading, selectedProperty, properties } = useProperty();

  useEffect(() => {
    if (isMobile) {
       setIsOpen(false);
    }
  }, [location.pathname, isMobile]);

  // --- FIX: Update document title with refined matching ---
  useEffect(() => {
      let pageTitle = "CoHaven"; // Default title

      // Prioritize specific matches first
      const coOwnersMatch = location.pathname.match(/^\/properties\/[^/]+\/co-owners(\/.*)?$/);
      const settingsMatch = location.pathname.startsWith('/settings');

      if (coOwnersMatch) {
          pageTitle = "Co-Owners | CoHaven";
      } else if (settingsMatch) {
          pageTitle = "Settings | CoHaven";
      } else {
          // Check other navigation items only if specific matches failed
          const otherPage = navigation.find((item) => {
              // Skip already checked paths
              if (item.path === '/co-owners' || item.path === '/settings') return false;
              // Exact match for properties
              if (item.path === '/properties') return location.pathname === '/properties';
              // Standard startsWith for others
              return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          });
          if (otherPage) {
              pageTitle = `${otherPage.name} | CoHaven`;
          }
      }
      document.title = pageTitle;
  }, [location.pathname]);


  const Sidebar = () => (
     <aside className={cn( "bg-gray-100 h-full pb-4 flex flex-col border-r border-gray-200", "w-64 shrink-0" )}>
        <div className="px-4 py-6 border-b border-gray-200"> <Link to="/dashboard" className="flex items-center gap-2 text-gray-900"> <span className="font-poppins text-xl font-semibold tracking-tight text-navy-900">CoHaven</span> </Link> </div>
        <div className="px-3 py-4 border-b border-gray-200"> {isPropertyLoading ? (<Skeleton className="h-[56px] w-full rounded-md bg-gray-200" />) : (<PropertySelector />)} </div>
        <nav className="px-3 flex-1 mt-6 overflow-y-auto">
            <div className="space-y-1">
                {navigation.map((item) => {
                    // --- FIX: Determine isActive with refined logic ---
                    let isActive = false;
                    if (item.path === '/co-owners') {
                        isActive = location.pathname.match(/^\/properties\/[^/]+\/co-owners(\/.*)?$/) !== null;
                    } else if (item.path === '/settings') {
                        isActive = location.pathname.startsWith('/settings');
                    } else if (item.path === '/properties') {
                        // Only active for exact '/properties' match (adjust if /new or /edit should also activate)
                        isActive = location.pathname === '/properties';
                    }
                     else {
                        // Standard match for other items
                        isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                    }

                    let linkPath = item.path;
                    if (item.name === "Co-owners") {
                        linkPath = selectedProperty ? `/properties/${selectedProperty.id}/co-owners` : '#';
                    }
                    const isDisabled = item.name === "Co-owners" && !selectedProperty;

                    return (
                        <Link
                            key={item.name}
                            to={linkPath}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out",
                                isActive ? "bg-slate-700 text-white shadow-sm" : "text-gray-600 hover:bg-gray-200 hover:text-gray-900",
                                isDisabled ? "opacity-50 cursor-not-allowed" : ""
                            )}
                            onClick={(e) => { if (isDisabled) e.preventDefault(); }}
                            aria-disabled={isDisabled}
                         >
                            <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "text-gray-500")} />
                            <span className={cn(isActive ? "text-white" : "")}>{item.name}</span>
                            {isActive && <ChevronRight className="ml-auto h-4 w-4 text-white opacity-75" />}
                        </Link>
                     );
                 })}
            </div>
        </nav>
        <div className="mt-auto px-3 pt-4 border-t border-gray-200">
            <div className="bg-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                     {/* Added null checks for user metadata */}
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium text-xs shrink-0"> {getUserInitials(user?.user_metadata?.first_name, user?.user_metadata?.last_name)} </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="text-sm font-medium text-gray-800 truncate"> {user?.user_metadata?.first_name ?? 'User'} {user?.user_metadata?.last_name ?? ''} </div>
                        <div className="text-xs text-gray-500 truncate"> {user?.email || 'No email'} </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={signOut} title="Sign Out" className="ml-auto text-gray-500 hover:text-red-600"> <LogOut className="h-4 w-4" /> </Button>
                </div>
            </div>
        </div>
    </aside>
  );

  console.log(`DashboardLayout Render Check: isPropertyLoading=${isPropertyLoading}, selectedProperty type=${typeof selectedProperty}, hasProperties=${properties.length > 0}`);
  const showLoading = isPropertyLoading || (properties.length > 0 && selectedProperty === undefined); // Show loading if props > 0 but selection is undefined briefly
  const needsPropertySelection = !isPropertyLoading && selectedProperty === null && properties.length > 0;


  return (
    <div className="min-h-screen flex">
      {!isMobile && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0">
        {isMobile && (
             <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 sticky top-0 z-20"> <Sheet open={isOpen} onOpenChange={setIsOpen}> <SheetTrigger asChild> <Button variant="outline" size="icon"> <Menu className="h-5 w-5" /> </Button> </SheetTrigger> <SheetContent side="left" className="p-0 w-72 bg-gray-100 z-50"> <Sidebar /> </SheetContent> </Sheet> <Link to="/dashboard" className="flex items-center gap-2 text-gray-900"> <span className="font-poppins text-lg font-semibold tracking-tight text-navy-900">CoHaven</span> </Link> </header>
        )}

        <main className="flex-1 overflow-auto bg-slate-100 relative">
          {showLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">
                 {isPropertyLoading ? 'Loading property data...' : 'Selecting property...'}
              </span>
            </div>
          ) : needsPropertySelection ? (
             <div className="container mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
                <div className="text-center text-muted-foreground p-8 border rounded-lg bg-card shadow-sm">
                    <p className="mb-4">Please select a property from the sidebar to view Co-Owners.</p>
                    <Button onClick={() => navigate('/properties')}>Go to Properties</Button>
                </div>
             </div>
          ) : (
            <div className="container mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
                 {children ?? <Outlet /> } {/* Render children (if passed) or Outlet */}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;