import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { jwt, username } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { Pool } from "pg";
import { config } from "./config.js";
import { firebasePhoneBridge } from "./firebase-phone-plugin.js";

export const authPool = new Pool({ connectionString: config.databaseURL });

function assuranceClaims(session: Record<string, unknown> | null | undefined) {
  const expiresValue = session?.assuranceExpiresAt;
  const expiresAt = expiresValue instanceof Date ? expiresValue : expiresValue ? new Date(String(expiresValue)) : null;
  const isL3 = session?.assuranceLevel === "L3" && !!expiresAt && expiresAt.getTime() > Date.now();
  return {
    "https://sentinel/auth/assurance": isL3 ? "L3" : "L2",
    "https://sentinel/auth/assurance_expires_at": isL3 ? expiresAt?.toISOString() : null,
  };
}

export const auth = betterAuth({
  appName: "Kosh Secure Sign-In",
  baseURL: config.baseURL,
  basePath: "/api/auth",
  secret: config.secret,
  database: authPool,
  trustedOrigins: config.trustedOrigins,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      phoneNumber: { type: "string", required: false, input: false, unique: true },
      sentinelUserId: { type: "string", required: false, input: false, unique: true },
    },
  },
  session: {
    expiresIn: 8 * 60 * 60,
    updateAge: 15 * 60,
    freshAge: 5 * 60,
    storeSessionInDatabase: true,
    additionalFields: {
      assuranceLevel: { type: "string", required: false, input: false, defaultValue: "L2" },
      assuranceExpiresAt: { type: "date", required: false, input: false },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
    customRules: {
      "/firebase/exchange": { window: 60, max: 10 },
      "/firebase/step-up": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/oauth2/token": { window: 60, max: 60 },
    },
  },
  advanced: {
    useSecureCookies: config.production,
    cookiePrefix: "sentinel_auth",
  },
  plugins: [
    username({ immutableUsername: true }),
    jwt({
      jwks: {
        keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
      },
    }),
    firebasePhoneBridge(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      scopes: ["openid", "profile", "offline_access", "banking.read", "banking.propose"],
      resources: [
        {
          identifier: config.audience,
          name: "Kosh Banking API",
          accessTokenTtl: 300,
          refreshTokenTtl: 30 * 24 * 60 * 60,
          allowedScopes: ["openid", "profile", "banking.read", "banking.propose"],
        },
        {
          identifier: config.mcpAudience,
          name: "Kosh agent gateway (MCP)",
          accessTokenTtl: 300,
          refreshTokenTtl: 7 * 24 * 60 * 60,
          allowedScopes: ["openid", "profile", "banking.read", "banking.propose"],
        },
      ],
      resourceSeedMode: "merge",
      enforcePerClientResources: false,
      cachedTrustedClients: new Set([config.webClientId]),
      accessTokenExpiresIn: 300,
      idTokenExpiresIn: 300,
      refreshTokenExpiresIn: 30 * 24 * 60 * 60,
      refreshTokenReuseInterval: 30,
      codeExpiresIn: 900,
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      extensions: [{
        claims: {
          accessToken: async ({ ctx, sessionId, user }) => {
            const session = sessionId
              ? await ctx.context.adapter.findOne({
                  model: "session",
                  where: [{ field: "id", operator: "eq", value: sessionId }],
                })
              : null;
            return {
              ...assuranceClaims(session as Record<string, unknown> | null),
              "https://sentinel/auth/sentinel_user_id": user?.sentinelUserId ?? null,
              "https://sentinel/auth/username": user?.username ?? null,
            };
          },
        },
      }],
      customIdTokenClaims: ({ user }) => ({
        "https://sentinel/auth/sentinel_user_id": user?.sentinelUserId ?? null,
        "https://sentinel/auth/username": user?.username ?? null,
      }),
      generateClientId: () =>
        process.env.AUTH_BOOTSTRAP_CLIENT_ID ?? randomBytes(24).toString("base64url"),
      generateClientSecret: () =>
        process.env.AUTH_BOOTSTRAP_CLIENT_SECRET ?? randomBytes(32).toString("base64url"),
      prefix: {
        refreshToken: "sentinel_rt_",
        opaqueAccessToken: "sentinel_at_",
      },
    }),
  ],
});
