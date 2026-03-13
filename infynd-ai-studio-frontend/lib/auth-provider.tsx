"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
    user: (User & { isAdmin?: boolean }) | null;
    session: Session | null;
    isLoading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    isLoading: true,
    signOut: async () => { },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<(User & { isAdmin?: boolean }) | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();
    const pathnameRef = useRef(pathname);

    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    const fetchAdminStatus = async (currentUser: User) => {
        try {
            const { data, error } = await supabase
                .from("user")
                .select("is_admin")
                .eq("id", currentUser.id)
                .single();

            if (!error && data) {
                return (currentUser.user_metadata?.is_admin || data.is_admin) as boolean;
            }
        } catch (err) {
            console.error("Error fetching admin status:", err);
        }
        return !!currentUser.user_metadata?.is_admin;
    };

    useEffect(() => {
        // Check active sessions and sets the user
        const setData = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error("Error getting session:", error);
            }
            setSession(session);
            if (session?.user) {
                const isAdmin = await fetchAdminStatus(session.user);
                setUser({ ...session.user, isAdmin });
            } else {
                setUser(null);
            }
            setIsLoading(false);
        };

        setData();

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setSession(session);
                if (session?.user) {
                    const isAdmin = await fetchAdminStatus(session.user);
                    setUser({ ...session.user, isAdmin });
                } else {
                    setUser(null);
                }
                setIsLoading(false);

                // SIGNED_IN may fire during token recovery/refresh. Only redirect from auth pages.
                if (_event === "SIGNED_IN" && (pathnameRef.current === "/login" || pathnameRef.current === "/register" || pathnameRef.current === "/")) {
                    router.push("/dashboard");
                }
                if (_event === "SIGNED_OUT" && pathnameRef.current.startsWith("/dashboard")) {
                    router.push("/login");
                }
            }
        );

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [router]);

    // Handle protected routes
    useEffect(() => {
        if (!isLoading && !user && pathname.startsWith("/dashboard")) {
            router.push("/login");
        }
    }, [user, isLoading, pathname, router]);

    const signOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    return (
        <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
