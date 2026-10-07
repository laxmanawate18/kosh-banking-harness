import { createHash } from "node:crypto";
import { config } from "./config.js";
import { auth, authPool } from "./auth.js";

type ClientSeed = {
  id: string;
  secret?: string;
  name: string;
  redirects: string[];
  skipConsent: boolean;
  scopes?: string[];
};

const seeds: ClientSeed[] = [
  {
    id: config.webClientId,
    secret: config.webClientSecret,
    name: "Kosh Web",
    redirects: [`${config.sentinelWebURL}/api/auth/callback`],
    skipConsent: true,
  },
  {
    id: config.chatClientId,
    secret: config.chatClientSecret,
    name: "Kosh Mitra",
    redirects: [`${config.sentinelWebURL}/api/chat/oauth/callback`],
    skipConsent: false,
  },
  // Outside agents always see the consent page: the customer decides what each assistant app may do.
  ...config.agentClients.map((client) => ({ ...client, skipConsent: false })),
];

export async function bootstrap() {
  const authContext = await auth.$context;
  await authContext.runMigrations();
  for (const [phoneNumber, identity] of Object.entries(config.firebaseIdentities)) {
    const existingCustomer = await authPool.query(
      'SELECT "id" FROM "user" WHERE "sentinelUserId" = $1 OR "phoneNumber" = $2 ORDER BY CASE WHEN "phoneNumber" = $2 THEN 0 ELSE 1 END LIMIT 1',
      [identity.sentinelUserId, phoneNumber],
    );
    if (!existingCustomer.rowCount) {
      const phoneDigest = createHash("sha256").update(phoneNumber).digest("hex").slice(0, 24);
      await authContext.internalAdapter.createUser(
        {
          name: identity.name,
          email: `${phoneDigest}@phone.sentinel.invalid`,
          emailVerified: true,
          phoneNumber,
          sentinelUserId: identity.sentinelUserId,
        },
        { method: "bootstrap" },
      );
    } else {
      await authPool.query(
        'UPDATE "user" SET "sentinelUserId" = $1, "phoneNumber" = $2, "name" = $3, "updatedAt" = NOW() WHERE "id" = $4',
        [identity.sentinelUserId, phoneNumber, identity.name, existingCustomer.rows[0].id],
      );
    }
  }
  const staffAccounts = [
    { sentinelUserId: config.staffSentinelUserId, username: config.staffUsername, email: config.staffEmail,
      name: config.staffName, password: config.staffPassword },
    { sentinelUserId: config.adminSentinelUserId, username: config.adminUsername, email: config.adminEmail,
      name: config.adminName, password: config.adminPassword },
  ];
  for (const account of staffAccounts) {
    const staff = await authPool.query(
      'SELECT "id" FROM "user" WHERE "sentinelUserId" = $1 OR "username" = $2 OR "email" = $3 LIMIT 1',
      [account.sentinelUserId, account.username, account.email],
    );
    const userId = staff.rowCount
      ? staff.rows[0].id
      : (await auth.api.signUpEmail({
          body: { name: account.name, email: account.email, password: account.password, username: account.username },
        })).user.id;
    await authPool.query('UPDATE "user" SET "sentinelUserId" = $1 WHERE "id" = $2', [account.sentinelUserId, userId]);
  }
  const adminSignIn = await auth.api.signInUsername({
    body: { username: config.staffUsername, password: config.staffPassword },
    asResponse: true,
  });
  const sessionCookie = adminSignIn.headers.get("set-cookie")?.split(";", 1)[0];
  if (!sessionCookie) throw new Error("Staff bootstrap sign-in did not return a session cookie");
  const adminHeaders = new Headers({
    cookie: sessionCookie,
  });
  for (const seed of seeds) {
    const existing = await authPool.query(
      'SELECT "clientId" FROM "oauthClient" WHERE "clientId" = $1 LIMIT 1',
      [seed.id],
    );
    if (existing.rowCount) {
      // Keep return addresses in step with the configured web address (e.g. after moving to the custom domain).
      // Direct update: Better Auth refuses API updates to trusted clients, and Kosh's web client is one.
      await authPool.query(
        'UPDATE "oauthClient" SET "redirectUris" = $2::jsonb, "postLogoutRedirectUris" = $3::jsonb, "updatedAt" = NOW() WHERE "clientId" = $1',
        [seed.id, JSON.stringify(seed.redirects), JSON.stringify([config.sentinelWebURL])],
      );
      continue;
    }
    process.env.AUTH_BOOTSTRAP_CLIENT_ID = seed.id;
    if (seed.secret) process.env.AUTH_BOOTSTRAP_CLIENT_SECRET = seed.secret;
    else delete process.env.AUTH_BOOTSTRAP_CLIENT_SECRET;
    await auth.api.adminCreateOAuthClient({
      headers: adminHeaders,
      body: {
        client_name: seed.name,
        redirect_uris: seed.redirects,
        post_logout_redirect_uris: [config.sentinelWebURL],
        token_endpoint_auth_method: seed.secret ? "client_secret_basic" : "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        // Better Auth 1.7 requires HTTPS for `web` clients. The loopback-only
        // development registration remains confidential but uses the native
        // redirect profile; deployed HTTPS clients are registered as `web`.
        application_type: new URL(seed.redirects[0] ?? config.sentinelWebURL).protocol === "https:" ? "web" : "native",
        scope: `openid profile offline_access ${(seed.scopes ?? ["banking.read", "banking.propose"]).join(" ")}`,
        require_pkce: true,
        skip_consent: seed.skipConsent,
        enable_end_session: true,
      },
    });
  }
  delete process.env.AUTH_BOOTSTRAP_CLIENT_ID;
  delete process.env.AUTH_BOOTSTRAP_CLIENT_SECRET;
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("bootstrap-clients.ts") ||
  process.argv[1].endsWith("bootstrap-clients.js")
);

if (isDirectRun) {
  bootstrap()
    .then(() => authPool.end())
    .catch(async (error) => {
      console.error(error);
      await authPool.end();
      process.exitCode = 1;
    });
}
