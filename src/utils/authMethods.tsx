/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { AuthState } from "@/types/auth";

type SetAuthState = (state: AuthState | ((prevState: AuthState) => AuthState)) => void;
type ToastFunction = (props: {
  variant?: "default" | "destructive";
  title: string;
  description: string;
}) => void;

export const authMethods = {
  loginWithLinkedIn: async (..._args: unknown[]) => ({
    success: false,
    message: "LinkedIn OAuth is disabled in challenge mode. Use a seeded demo user.",
  }),

  logout: async (setState: SetAuthState, toast: ToastFunction, suppressToast?: boolean) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));
      await supabase.auth.signOut();
      setState({ user: null, session: null, isLoading: false, error: null });

      if (!suppressToast) {
        toast({ title: "Logged out", description: "You have been signed out." });
      }
      return { success: true };
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message || "An unexpected error occurred",
        isLoading: false,
      }));
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: error.message || "An unexpected error occurred",
      });
      return { success: false, message: error.message || "Logout failed" };
    }
  },

  revokeLinkedInAccess: async () => ({
    success: false,
    message: "LinkedIn token management is disabled in challenge mode.",
  }),
};
