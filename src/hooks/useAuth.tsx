import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const hadSessionRef = useRef(false);

  const showSessionExpiredToast = () => {
    toast({
      title: "Session Expired",
      description: "Your session has expired. Please sign in again.",
      variant: "destructive",
    });
    // Redirect to auth page after showing toast
    window.location.href = '/auth';
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Handle token refresh errors by clearing invalid session
        if (event === 'TOKEN_REFRESHED' && !session) {
          if (hadSessionRef.current) {
            showSessionExpiredToast();
          }
          setSession(null);
          setUser(null);
          hadSessionRef.current = false;
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          hadSessionRef.current = false;
          sessionStorage.removeItem('session_only');
        } else {
          setSession(session);
          setUser(session?.user ?? null);
          if (session) {
            hadSessionRef.current = true;
          }
        }
        setLoading(false);
      }
    );

    // Get initial session with error handling for invalid tokens
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('Session retrieval error, clearing session:', error.message);
        if (hadSessionRef.current) {
          showSessionExpiredToast();
        }
        setSession(null);
        setUser(null);
        hadSessionRef.current = false;
      } else {
        setSession(session);
        setUser(session?.user ?? null);
        if (session) {
          hadSessionRef.current = true;
        }
      }
      setLoading(false);
    }).catch((err) => {
      console.warn('Failed to get session:', err);
      if (hadSessionRef.current) {
        showSessionExpiredToast();
      }
      setSession(null);
      setUser(null);
      hadSessionRef.current = false;
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle session-only mode: clear session on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionStorage.getItem('session_only') === 'true') {
        // Sign out when browser/tab closes (session-only mode)
        supabase.auth.signOut();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error };
  };

  const signIn = async (email: string, password: string, rememberMe: boolean = true) => {
    // When rememberMe is false, we sign out first to clear any existing session,
    // then sign in. The session will still be created but user can manually sign out.
    // Note: Supabase sessions persist by default. For session-only behavior,
    // users should simply sign out when done.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (!error && !rememberMe) {
      // Store a flag to indicate session should not be persistent
      sessionStorage.setItem('session_only', 'true');
    } else {
      sessionStorage.removeItem('session_only');
    }
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
