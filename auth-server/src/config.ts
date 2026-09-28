export type FirebaseIdentity = {
  name: string;
  sentinelUserId: string;
};

const DEFAULT_IDENTITIES: Record<string, FirebaseIdentity> = {
  "+919876543210": { name: "Aarav Mehta", sentinelUserId: "USR-CUSTOMER-001" },
  "+919839774797": { name: "Sudhir Jaiswal", sentinelUserId: "USR-CUSTOMER-002" },
};

function parseOrigins(value: string | undefined, fallback: string[]): string[] {
  return (value ? value.split(",") : fallback).map((item) => item.trim()).filter(Boolean);
}

function parseIdentityMap(value: string | undefined): Record<string, FirebaseIdentity> {
  if (!value) return DEFAULT_IDENTITIES;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AUTH_FIREBASE_IDENTITIES must be a JSON object");
  }
  return parsed as Record<string, FirebaseIdentity>;
}

const production = process.env.NODE_ENV === "production";
const authSecret = process.env.BETTER_AUTH_SECRET ?? "sentinel-auth-development-secret-change-me";
if (production && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}
if (production && (!process.env.SENTINEL_WEB_CLIENT_SECRET || !process.env.SENTINEL_CHAT_CLIENT_SECRET)) {
  throw new Error("SENTINEL_WEB_CLIENT_SECRET and SENTINEL_CHAT_CLIENT_SECRET are required in production");
}

if (production && !process.env.AUTH_INTERNAL_TOKEN) {
  throw new Error("AUTH_INTERNAL_TOKEN is required in production");
}

export const config = {
  production,
  internalToken: process.env.AUTH_INTERNAL_TOKEN ?? "kosh-internal-development-token",
  port: Number(process.env.PORT ?? process.env.AUTH_PORT ?? "8020"),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8020",
  secret: authSecret,
  databaseURL:
    process.env.AUTH_DATABASE_URL ??
    "postgresql://sentinel_auth:sentinel_auth_dev@127.0.0.1:5434/sentinel_auth",
  sentinelWebURL: process.env.SENTINEL_WEB_URL ?? "http://127.0.0.1:8017",
  audience: process.env.SENTINEL_API_AUDIENCE ?? "http://127.0.0.1:8017/api",
  trustedOrigins: Array.from(
    new Set([
      process.env.SENTINEL_WEB_URL ?? "http://127.0.0.1:8017",
      process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8020",
      ...parseOrigins(process.env.AUTH_TRUSTED_ORIGINS, []),
    ].map((item) => item.trim()).filter(Boolean)),
  ),
  firebaseProjectId:
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.PROJECT_ID ||
    "",
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY || "",
  firebaseAuthDomain:
    process.env.FIREBASE_AUTH_DOMAIN ||
    `${process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || ""}.firebaseapp.com`,
  firebaseIdentities: parseIdentityMap(process.env.AUTH_FIREBASE_IDENTITIES),
  localFirebaseTestPhone: process.env.AUTH_FIREBASE_TEST_PHONE ?? "+919876543210",
  localFirebaseTestCode: process.env.AUTH_FIREBASE_TEST_CODE ?? "246810",
  webClientId: process.env.SENTINEL_WEB_CLIENT_ID ?? "sentinel-web",
  webClientSecret:
    process.env.SENTINEL_WEB_CLIENT_SECRET ?? "sentinel-web-development-secret",
  chatClientId: process.env.SENTINEL_CHAT_CLIENT_ID ?? "sentinel-chat",
  chatClientSecret:
    process.env.SENTINEL_CHAT_CLIENT_SECRET ?? "sentinel-chat-development-secret",
  staffUsername: process.env.AUTH_STAFF_USERNAME ?? "officer.mumbai",
  staffPassword: process.env.AUTH_STAFF_PASSWORD ?? "Officer@2468",
  staffEmail: process.env.AUTH_STAFF_EMAIL ?? "officer.mumbai@staff.sentinel.invalid",
  staffName: process.env.AUTH_STAFF_NAME ?? "Neha Rao",
  staffSentinelUserId: process.env.AUTH_STAFF_SENTINEL_USER_ID ?? "USR-OFFICER-001",
} as const;

export function isAllowedReturnURL(value: string): boolean {
  try {
    const target = new URL(value, config.sentinelWebURL);
    return target.origin === new URL(config.sentinelWebURL).origin;
  } catch {
    return false;
  }
}
