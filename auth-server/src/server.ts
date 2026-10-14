import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { toNodeHandler } from "better-auth/node";
import { auth, authPool } from "./auth.js";
import { config, isAllowedReturnURL } from "./config.js";
import { consentPage, signInPage } from "./pages.js";

const authHandler = toNodeHandler(auth);

function internalCaller(request: import("node:http").IncomingMessage): boolean {
  const given = Buffer.from(String(request.headers["x-kosh-internal-token"] ?? ""));
  const expected = Buffer.from(config.internalToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function sendJSON(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJSON(request: import("node:http").IncomingMessage): Promise<Record<string, any>> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

function sendHTML(response: import("node:http").ServerResponse, html: string) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com https://www.gstatic.com https://recaptchaenterprise.googleapis.com",
      "frame-src 'self' https://www.google.com https://www.recaptcha.net https://*.firebaseapp.com",
      "img-src 'self' data: https://www.gstatic.com https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(html);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", config.baseURL);
  if (url.pathname.startsWith("/api/internal/") && !internalCaller(request)) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "internal endpoint requires the Kosh service token" }));
    return;
  }
  if (url.pathname === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("User-agent: *\nDisallow: /\n");
    return;
  }
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok", issuer: `${config.baseURL}/api/auth` }));
    return;
  }
  // Connected assistant apps for one customer (called by Kosh with the internal token, never by browsers).
  if (url.pathname === "/api/internal/agent-access" && request.method === "GET") {
    const agents = new Map(config.agentClients.map((client) => [client.id, client.name]));
    const rows = await authPool.query(
      'SELECT c."clientId", c."scopes", c."createdAt" FROM "oauthConsent" c JOIN "user" u ON u."id" = c."userId" '
        + 'WHERE u."sentinelUserId" = $1 AND c."clientId" = ANY($2::text[]) ORDER BY c."createdAt" DESC',
      [url.searchParams.get("sentinelUserId") ?? "", [...agents.keys()]],
    );
    sendJSON(response, 200, { apps: rows.rows.map((row) => ({
      client_id: row.clientId, name: agents.get(row.clientId), scopes: row.scopes, connected_at: row.createdAt,
    })) });
    return;
  }
  if (url.pathname === "/api/internal/agent-access/revoke" && request.method === "POST") {
    const { sentinelUserId, clientId } = await readJSON(request);
    if (!config.agentClients.some((client) => client.id === clientId)) {
      sendJSON(response, 400, { error: "Not a registered assistant app" });
      return;
    }
    // Consent removed and refresh tokens revoked; issued access tokens expire within 5 minutes.
    const user = await authPool.query('SELECT "id" FROM "user" WHERE "sentinelUserId" = $1 LIMIT 1', [sentinelUserId ?? ""]);
    const userId = user.rows[0]?.id ?? "";
    const consent = await authPool.query('DELETE FROM "oauthConsent" WHERE "userId" = $1 AND "clientId" = $2', [userId, clientId]);
    await authPool.query(
      'UPDATE "oauthRefreshToken" SET "revoked" = NOW() WHERE "userId" = $1 AND "clientId" = $2 AND "revoked" IS NULL',
      [userId, clientId],
    );
    sendJSON(response, 200, { revoked: (consent.rowCount ?? 0) > 0 });
    return;
  }
  if (url.pathname === "/api/internal/provision-user" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { name, email, username, password, sentinelUserId, phoneNumber } = payload;
        if (!username || !password) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "username and password are required" }));
          return;
        }
        const safeEmail = email || `${username}@user.sentinel.bank`;
        const authContext = await auth.$context;
        const hashedPassword = await authContext.password.hash(password);

        // Only the user already bound to this customer may be updated (credential re-issue).
        // Any other clash on username / email / phone is refused so an application can never take over a login.
        const owned = sentinelUserId
          ? await authPool.query('SELECT "id" FROM "user" WHERE "sentinelUserId" = $1 LIMIT 1', [sentinelUserId])
          : { rows: [] as any[] };
        let userId = owned.rows[0]?.id;
        const clash = await authPool.query(
          'SELECT "id" FROM "user" WHERE ("username" = $1 OR "email" = $2 OR ("phoneNumber" IS NOT NULL AND "phoneNumber" = $3)) AND "id" <> $4 LIMIT 1',
          [username, safeEmail, phoneNumber || "", userId || ""],
        );
        if (clash.rowCount) {
          response.writeHead(409, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "username, email or phone already belongs to another sign-in" }));
          return;
        }
        if (!userId) {
          const created = await authContext.internalAdapter.createUser(
            {
              name: name || username,
              email: safeEmail,
              emailVerified: true,
              phoneNumber: phoneNumber || null,
              sentinelUserId: sentinelUserId || null,
              username: username,
            },
            { method: "provision" },
          );
          userId = created.id;
        } else {
          const current = await authContext.internalAdapter.findUserById(userId);  // the username plugin refuses an unchanged name
          await authContext.internalAdapter.updateUser(userId, {
            ...((current as any)?.username !== username ? { username } : {}),
            ...(phoneNumber ? { phoneNumber } : {}), ...(name ? { name } : {}),
          });
        }

        // The credential (password) account: re-issue updates it, a first issue links it.
        const accounts = await authContext.internalAdapter.findAccounts(userId);
        if (accounts.some((a) => a.providerId === "credential")) {
          await authContext.internalAdapter.updatePassword(userId, hashedPassword);
        } else {
          await authContext.internalAdapter.linkAccount({ userId, accountId: userId, providerId: "credential", password: hashedPassword });
        }

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: true, userId, username }));
      } catch (err: any) {
        console.error("[provision-user error]", err);
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (url.pathname === "/api/internal/wipe-user" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { sentinelUserId, phoneNumber, username } = payload;
        const users = await authPool.query(
          'SELECT "id" FROM "user" WHERE ("sentinelUserId" IS NOT NULL AND "sentinelUserId" = $1) OR ("username" IS NOT NULL AND "username" = $2) OR ("phoneNumber" IS NOT NULL AND "phoneNumber" = $3)',
          [sentinelUserId || "", username || "", phoneNumber || ""],
        );
        const userIds = users.rows.map((r: any) => r.id);
        if (userIds.length > 0) {
          await authPool.query('DELETE FROM "session" WHERE "userId" = ANY($1)', [userIds]);
          await authPool.query('DELETE FROM "account" WHERE "userId" = ANY($1)', [userIds]);
          await authPool.query('DELETE FROM "user" WHERE "id" = ANY($1)', [userIds]);
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: true, wiped_users: userIds.length }));
      } catch (err: any) {
        console.error("[wipe-user error]", err);
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (url.pathname === "/sign-in") {
    sendHTML(response, signInPage());
    return;
  }
  if (url.pathname === "/consent") {
    sendHTML(response, consentPage(url));
    return;
  }
  if (url.pathname === "/sign-out") {
    const returnTo = url.searchParams.get("return_to") ?? config.sentinelWebURL;
    const safeReturn = isAllowedReturnURL(returnTo) ? returnTo : config.sentinelWebURL;
    const cookieHeader = String(request.headers.cookie ?? "");
    const sessionMatch = cookieHeader.match(/(?:__Secure-)?sentinel_auth\.session_token=([^;]+)/);
    if (sessionMatch?.[1]) {
      const rawCookieVal = decodeURIComponent(sessionMatch[1].trim());
      const tokenPart = rawCookieVal.split(".")[0];
      try {
        await authPool.query('DELETE FROM "session" WHERE "token" = $1 OR "token" = $2', [rawCookieVal, tokenPart]);
      } catch (err) {
        console.warn("[sign-out DB cleanup notice]", err);
      }
    }
    response.writeHead(302, {
      location: safeReturn,
      "set-cookie": [
        "sentinel_auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        "sentinel_auth.session_data=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        "sentinel_auth.dont_remember=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        "sentinel_auth.csrf_token=; Max-Age=0; Path=/; SameSite=Lax",
        "__Secure-sentinel_auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        "__Secure-sentinel_auth.session_data=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        "__Secure-sentinel_auth.dont_remember=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        "__Secure-sentinel_auth.csrf_token=; Max-Age=0; Path=/; Secure; SameSite=Lax",
      ],
      "cache-control": "no-store",
    });
    response.end();
    return;
  }
  if (url.pathname === "/") {
    response.writeHead(302, { location: config.sentinelWebURL });
    response.end();
    return;
  }
  try {
    await authHandler(request, response);
  } catch (error) {
    console.error("[authHandler error]", request.method, request.url, error);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: error instanceof Error ? error.message : "Internal auth server error" }));
    }
  }
});

async function start() {
  if (process.env.AUTH_AUTO_BOOTSTRAP === "true") {
    const { bootstrap } = await import("./bootstrap-clients.js");
    await bootstrap();
  } else if (process.env.AUTH_AUTO_MIGRATE === "true") {
    await (await auth.$context).runMigrations();
  }
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`Kosh Secure Sign-In listening on ${config.baseURL}`);
  });
}

start().catch((error) => {
  console.error("Kosh Secure Sign-In failed to start", error);
  process.exitCode = 1;
});
