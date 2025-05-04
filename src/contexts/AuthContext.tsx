// src/contexts/AuthContext.tsx
// Refined onAuthStateChange to prevent navigation on subsequent SIGNED_IN events (like token refresh)

import { createContext, useContext, useEffect, useState, useRef } from 'react'; // Added useRef
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean; // Represents initial auth state loading
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Use state for session/user
  const [session, setSessionState] = useState<Session | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Initial loading is true
  const navigate = useNavigate();
  const { toast } = useToast();

  // Use a ref to track the previous session state to detect the *actual* initial sign-in
  const previousSessionRef = useRef<Session | null>(null);
  useEffect(() => {
      previousSessionRef.current = session;
  }, [session]);


  useEffect(() => {
    console.log("AuthProvider Effect: Setting up listener and getting initial session.");

    // 1. Get Initial Session (avoids waiting for listener on first load)
    let initialSessionChecked = false;
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("AuthProvider: Initial getSession returned:", initialSession ? 'Session found' : 'No session');
      if (!initialSessionChecked) { // Ensure listener doesn't overwrite this immediately
         setSessionState(initialSession);
         setUserState(initialSession?.user ?? null);
         previousSessionRef.current = initialSession; // Set initial ref state
         setLoading(false); // Initial load complete
         initialSessionChecked = true;
      }
    }).catch(error => {
        console.error("AuthProvider: Error in initial getSession:", error);
        setLoading(false); // Still finish loading even on error
        initialSessionChecked = true;
    });

    // 2. Set up Auth State Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log(`AuthProvider: onAuthStateChange Event: ${event}`, currentSession ? `Session User: ${currentSession.user.id}` : 'No Session');

        // Update session/user state regardless of event type
        setSessionState(currentSession);
        setUserState(currentSession?.user ?? null);

        // Check if initial getSession has finished to avoid race conditions
        if (!initialSessionChecked) {
             console.log("AuthProvider: Listener fired before initial getSession finished, deferring side-effects.");
             // Potentially set loading false here if initial getSession hasn't by now
             if (loading) setLoading(false);
             initialSessionChecked = true; // Mark as checked now
             // Update ref here too in case getSession was slow
             previousSessionRef.current = currentSession;
        }

        // More specific navigation logic
        if (event === 'SIGNED_IN') {
          // Only navigate to dashboard if the user was previously logged OUT (previousSession was null)
          if (previousSessionRef.current === null) {
             console.log("AuthProvider: Initial SIGNED_IN detected, navigating to /dashboard.");
             navigate('/dashboard', { replace: true });
          } else {
             console.log("AuthProvider: Subsequent SIGNED_IN event (e.g., refresh), no navigation needed.");
          }
        } else if (event === 'SIGNED_OUT') {
          console.log("AuthProvider: SIGNED_OUT detected, navigating to /signin.");
          // Clear potentially persisted property selection on sign out
          localStorage.removeItem('selectedPropertyId');
          navigate('/signin', { replace: true });
        } else if (event === 'TOKEN_REFRESHED') {
            console.log("AuthProvider: Token refreshed, session updated, no navigation needed.");
        } else if (event === 'USER_UPDATED') {
            console.log("AuthProvider: User updated, session updated, no navigation needed.");
            setUserState(currentSession?.user ?? null); // Ensure user state updates
        }
         // USER_DELETED, PASSWORD_RECOVERY events might need handling later

        // Ensure loading is false after the first event is processed by the listener
        if (loading) {
          console.log("AuthProvider: Setting loading to false after first listener event.");
          setLoading(false);
        }
      }
    );

    // Cleanup listener on unmount
    return () => {
      console.log("AuthProvider Effect: Unsubscribing auth listener.");
      subscription.unsubscribe();
    };
  }, [navigate, loading]); // Keep loading in deps? Maybe not needed if handled internally. Remove for now. Let's test.
  //}, [navigate]); // Let's try removing loading dependency


  // --- Action Functions (Unchanged) ---
  const signIn = async (email: string, password: string) => {
     // ... signIn logic ...
     try { const { error } = await supabase.auth.signInWithPassword({ email, password, }); if (error) throw error; } catch (error: any) { toast({ title: "Error signing in", description: error.message, variant: "destructive", }); throw error; }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    // ... signUp logic ...
     try { const { error } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, }, }, }); if (error) throw error; toast({ title: "Success", description: "Account created successfully. Please check your email to verify.", }); /* Removed navigate('/signin') - Supabase sends verification */ } catch (error: any) { toast({ title: "Error signing up", description: error.message, variant: "destructive", }); throw error; }
  };

  const signOut = async () => {
     // ... signOut logic ...
     try { const { error } = await supabase.auth.signOut(); if (error) throw error; } catch (error: any) { toast({ title: "Error signing out", description: error.message, variant: "destructive", }); throw error; }
  };
  // --- End Action Functions ---

  // Provide state and actions
  return (
    <AuthContext.Provider value={{ session, user, signIn, signUp, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook remains the same
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};