import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setCurrentActorId } from "../../lib/api/config";
import { loadAuthSession, type AuthenticatedUser } from "../../lib/auth/session";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "anonymous" }
  | { status: "authenticated"; user: AuthenticatedUser };

const AuthContext = createContext<AuthenticatedUser | null>(null);

export function useAuthenticatedUser() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    loadAuthSession()
      .then((session) => {
        if (!active) return;
        if (!session) {
          setCurrentActorId("");
          setState({ status: "anonymous" });
          return;
        }
        setCurrentActorId(session.user.employeeId);
        setState({ status: "authenticated", user: session.user });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Unable to verify your session." });
      });
    return () => { active = false; };
  }, []);

  if (state.status === "loading") {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-600">Checking your MMS session…</main>;
  }
  if (state.status === "error") {
    return <main className="grid min-h-screen place-items-center p-6 text-center"><section className="max-w-md space-y-3"><h1 className="text-xl font-semibold">MMS is unavailable</h1><p>{state.message}</p><button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => window.location.reload()}>Retry</button></section></main>;
  }
  if (state.status === "anonymous") {
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><section className="max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-semibold text-slate-950">Sign in to MMS</h1><p className="text-sm text-slate-600">Use your organization account to access Merchandising Management System.</p><a className="inline-flex rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700" href="/auth/login">Continue with organization sign-in</a></section></main>;
  }

  return <AuthContext.Provider value={state.user}>{children}</AuthContext.Provider>;
}
