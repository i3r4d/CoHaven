// src/App.tsx
// v12 - Fix Routing: Add public root route for Landing, change /login to /signin, add route for NewProperty.

import React, { Suspense, lazy, ComponentType } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PropertyProvider } from '@/contexts/PropertyContext';
import { ExpenseProvider } from '@/contexts/ExpenseContext';
import { RecurringExpenseProvider } from './contexts/RecurringExpenseContext';
import { BookingProvider } from './contexts/BookingContext';
import { MaintenanceProvider } from './contexts/MaintenanceContext';
import { DocumentProvider } from './contexts/DocumentContext';
import { CoOwnerProvider } from './contexts/CoOwnerContext';

import { AuthGuard } from '@/components/AuthGuard';
import FullPageSpinner from '@/components/FullPageSpinner';

// --- Helper for Lazy Loading Named Exports ---
const lazyLoad = (path: string, componentName?: string) => {
  return lazy(async () => {
    // Add vite-ignore comment if the Vite warning persists and is acceptable
    /* @vite-ignore */
    const module = await import(/* @vite-ignore */ path); // Added /* @vite-ignore */ inside import()
    const Component = module.default || (componentName ? module[componentName] : undefined);

    if (!Component) {
        console.error(`Failed to load component from ${path}. Check export name ('default' or '${componentName}'). Module keys:`, Object.keys(module));
        const FallbackComponent: ComponentType = () => <div className="p-4 text-red-600">Error loading component: {path}. Check console.</div>;
        return { default: FallbackComponent };
    }
    return { default: Component };
  });
};


// --- Layouts ---
const DashboardLayout = lazy(() => import('@/layouts/DashboardLayout.tsx'));
const AuthLayout = lazy(() => import('@/layouts/AuthLayout.tsx'));

// --- Page Imports ---

// Public Pages (NEW)
const LandingPage = lazyLoad('./pages/Landing.tsx'); // Assuming default export for Landing

// Auth pages
const SignIn = lazyLoad('./pages/auth/SignIn.tsx'); // Use lazyLoad helper for consistency, assumes default export
const SignUp = lazyLoad('./pages/auth/SignUp.tsx'); // Use lazyLoad helper, assumes default export
const ForgotPassword = lazyLoad('./pages/auth/ForgotPassword.tsx'); // Use lazyLoad helper, assumes default export

// Authenticated Pages (using verified relative paths via helper)
const DashboardPage = lazyLoad('./pages/Dashboard.tsx', 'Dashboard');
const PropertyListPage = lazyLoad('./pages/properties/PropertyList.tsx', 'PropertyList');
const NewPropertyPage = lazyLoad('./pages/properties/NewProperty.tsx', 'NewPropertyPage'); // ADDED - Ensure correct export name
const EditPropertyPage = lazyLoad('./pages/properties/EditProperty.tsx', 'EditPropertyPage'); // ADDED (Anticipatory) - Ensure correct export name if needed
const ExpenseListPage = lazyLoad('./pages/expenses/ExpenseList.tsx', 'ExpenseList');
const RecurringExpensesPage = lazyLoad('./pages/recurring-expenses/RecurringExpensesPage.tsx', 'RecurringExpensesPage');
const CalendarPage = lazyLoad('./pages/calendar/CalendarPage.tsx', 'CalendarPage');
const MaintenancePage = lazyLoad('./pages/maintenance/MaintenancePage.tsx', 'MaintenancePage');
const DocumentsPage = lazyLoad('./pages/documents/DocumentsPage.tsx', 'DocumentsPage');
const UserSettingsPage = lazyLoad('./pages/settings/UserSettings.tsx', 'UserSettings');
const NotFound = lazyLoad('./pages/NotFound.tsx', 'NotFound');
const CoOwnersPage = lazyLoad('./pages/co-owners/CoOwnersPage.tsx', 'CoOwnersPage');


const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              {/* --- Public Routes --- */}
              {/* NEW: Public route for the landing page */}
              <Route path="/" element={<PublicAppWrapper><LandingPage /></PublicAppWrapper>} />

              {/* Authentication Routes */}
              <Route element={<AuthLayoutWrapper />}>
                {/* CHANGED path to /signin */}
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
              </Route>

              {/* --- Authenticated Dashboard Routes --- */}
              <Route element={<AuthenticatedAppWrapper />}>
                 {/* Redirect / logged-in root to dashboard */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                {/* Property Routes */}
                <Route path="/properties" element={<PropertyListPage />} />
                <Route path="/properties/new" element={<NewPropertyPage />} /> {/* ADDED Route */}
                {/* Optional: Add Edit route if needed later */}
                {/* <Route path="/properties/:propertyId/edit" element={<EditPropertyPage />} /> */}
                 <Route path="/properties/:propertyId/co-owners" element={<CoOwnersPage />} />
                 {/* Other Authenticated Routes */}
                <Route path="/expenses" element={<ExpenseListPage />} />
                <Route path="/recurring-expenses" element={<RecurringExpensesPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/maintenance" element={<MaintenancePage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/settings/*" element={<UserSettingsPage />} />
              </Route>

              {/* Not Found Route - Should be last */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

// --- Helper Wrappers ---

// NEW: Wrapper for public routes that might still need basic layout/context
// For now, just renders children. Could add a simple public layout later.
const PublicAppWrapper = ({ children }: { children: React.ReactNode }) => {
    // You could add a PublicLayout component here if needed
    return <>{children}</>;
};

// Wrapper for Auth pages (prevents access if already logged in)
const AuthLayoutWrapper = () => {
  const { session, loading } = useAuth(); // Use loading state

  // Show spinner while auth state is loading
  if (loading) {
      return <FullPageSpinner />;
  }

  // If loading is done and session exists, redirect away from auth pages
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  // If loading is done and no session, show AuthLayout and nested route (SignIn, SignUp etc)
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AuthLayout>
        <Outlet />
      </AuthLayout>
    </Suspense>
  );
};

// Wrapper for Authenticated pages (guards access, provides contexts & layout)
const AuthenticatedAppWrapper = () => (
  <AuthGuard> {/* AuthGuard handles redirect if not authenticated */}
    <PropertyProvider>
      <ExpenseProvider>
         <RecurringExpenseProvider>
             <BookingProvider>
                 <MaintenanceProvider>
                    <DocumentProvider>
                       <CoOwnerProvider>
                          <Suspense fallback={<FullPageSpinner />}>
                            <DashboardLayout>
                              <Outlet />
                            </DashboardLayout>
                          </Suspense>
                       </CoOwnerProvider>
                     </DocumentProvider>
                 </MaintenanceProvider>
             </BookingProvider>
          </RecurringExpenseProvider>
       </ExpenseProvider>
    </PropertyProvider>
  </AuthGuard>
);

export default App;