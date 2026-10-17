import "express-session";

declare module "express-session" {
  interface SessionData {
    oidcTransaction?: {
      state: string;
      nonce: string;
      codeVerifier: string;
      createdAt: number;
    };
    identity?: {
      subject: string;
      employeeId: string;
      email?: string;
      displayName?: string;
      authenticatedAt: number;
      lastSeenAt: number;
    };
    oidcTokens?: {
      accessToken?: string;
      refreshToken?: string;
      idToken?: string;
      expiresAt?: number;
    };
    csrfToken?: string;
  }
}
