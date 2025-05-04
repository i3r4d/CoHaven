// src/components/AuthGuard.tsx
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // Added useLocation
import { useAuth } from '@/contexts/AuthContext';

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation(); // Get current location

  useEffect(() => {
    // *** ADDED LOGGING ***
    console.log(`AuthGuard Effect Check: Path=${location.pathname}, Loading=${loading}, Session Exists=${!!session}`);

    if (!loading && !session) {
      // *** ADDED LOGGING ***
      console.log(`AuthGuard: Redirecting to /signin (Loading=${loading}, Session Exists=${!!session})`);
      navigate('/signin', { replace: true }); // Added replace: true
    }
    // *** ADDED ELSE CASE LOGGING ***
    else if (!loading && session) {
        console.log(`AuthGuard: Access granted (Loading=${loading}, Session Exists=${!!session})`);
    } else {
        console.log(`AuthGuard: Still loading... (Loading=${loading}, Session Exists=${!!session})`);
    }
    // Add location.pathname to dependency array? Let's try without first to see if session/loading is the issue.
  }, [session, loading, navigate, location.pathname]); // Added location.pathname to deps

  if (loading) {
    // *** ADDED LOGGING ***
    console.log("AuthGuard: Rendering Loading state...");
    // Use a more consistent full-page loading indicator if preferred
    return (
        <div className="flex items-center justify-center h-screen">
            <div>Loading authentication...</div>
        </div>
    );
  }

  // *** ADDED LOGGING ***
  console.log(`AuthGuard: Rendering Children (Session Exists=${!!session})`);
  // Render children only if loading is false AND session exists.
  // If loading is false and session is null, the effect should have redirected.
  return !loading && session ? <>{children}</> : null; // Return null while redirecting
};