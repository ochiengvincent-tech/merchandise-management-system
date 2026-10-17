export type AuthenticatedUser = {
  subject: string;
  employeeId: string;
  email?: string;
  displayName?: string;
};

type AuthSessionResponse = {
  authenticated: true;
  user: AuthenticatedUser;
  csrfToken: string;
};

let csrfToken: string | undefined;

export function setCsrfToken(value: string | undefined) {
  csrfToken = value;
}

export function getCsrfToken() {
  return csrfToken;
}

export async function loadAuthSession(): Promise<AuthSessionResponse | null> {
  const response = await fetch("/auth/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) {
    setCsrfToken(undefined);
    return null;
  }
  if (!response.ok) throw new Error("Could not load your MMS session.");

  const session = (await response.json()) as AuthSessionResponse;
  setCsrfToken(session.csrfToken);
  return session;
}

export async function logout() {
  const token = getCsrfToken();
  if (!token) throw new Error("Your session security token is missing. Reload and try again.");

  const response = await fetch("/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-CSRF-Token": token },
  });
  if (!response.ok) throw new Error("Could not sign out. Please retry.");
  setCsrfToken(undefined);
  window.location.assign("/");
}
