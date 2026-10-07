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

// Outside agents the bank has approved (AUTH_AGENT_CLIENTS, a JSON list). Each gets its own OAuth client; there is no
// open self-registration. A client with no secret is public and must use PKCE (most MCP clients).
export type AgentClient = { id: string; name: string; redirects: string[]; secret?: string; scopes?: string[] };

export function parseAgentClients(value: string | undefined): AgentClient[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("AUTH_AGENT_CLIENTS must be a JSON list");
  for (const client of parsed as AgentClient[]) {
    if (!client.id || !client.name || !Array.isArray(client.redirects) || !client.redirects.length) {
      throw new Error("Each agent client needs id, name and redirects");
    }
    const unknown = (client.scopes ?? []).filter((scope) => !["banking.read", "banking.propose"].includes(scope));
    if (unknown.length) throw new Error(`Agent client ${client.id} asks for unknown scopes ${unknown.join(", ")}`);
  }
  return parsed as AgentClient[];
}

const production = process.env.NODE_ENV === "production";
const authSecret = process.env.BETTER_AUTH_SECRET ?? "sentinel-auth-development-secret-change-me";
if (production && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}
if (production && (!process.env.SENTINEL_WEB_CLIENT_SECRET || !process.env.SENTINEL_CHAT_CLIENT_SECRET)) {
  throw new Error("SENTINEL_WEB_CLIENT_SECRET and SENTINEL_CHAT_CLIENT_SECRET are required in production");
}

if (production && !process.env.AUTH_ADMIN_PASSWORD) {
  throw new Error("AUTH_ADMIN_PASSWORD is required in production");
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
  // Agent tokens are issued for the MCP gateway only, so they cannot be replayed against Kosh's own API.
  mcpAudience: process.env.SENTINEL_MCP_AUDIENCE ?? `${process.env.SENTINEL_WEB_URL ?? "http://127.0.0.1:8017"}/mcp`,
  agentClients: parseAgentClients(process.env.AUTH_AGENT_CLIENTS),
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
  // Demo OTP mode: sign-in and payment step-up check this fixed code for the registered demo numbers; no SMS is sent.
  demoOtp: process.env.AUTH_DEMO_OTP ?? "",
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
  // The AI and platform admin (Admin Panel). A separate person from the bank officer above.
  adminUsername: process.env.AUTH_ADMIN_USERNAME ?? "admin.kosh",
  adminPassword: process.env.AUTH_ADMIN_PASSWORD ?? "Admin@2468",
  adminEmail: process.env.AUTH_ADMIN_EMAIL ?? "admin.kosh@staff.sentinel.invalid",
  adminName: process.env.AUTH_ADMIN_NAME ?? "Kosh AI Admin",
  adminSentinelUserId: process.env.AUTH_ADMIN_SENTINEL_USER_ID ?? "USR-ADMIN-001",
} as const;

export function isAllowedReturnURL(value: string): boolean {
  try {
    const target = new URL(value, config.sentinelWebURL);
    return target.origin === new URL(config.sentinelWebURL).origin;
  } catch {
    return false;
  }
}
