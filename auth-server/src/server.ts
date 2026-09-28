import { createServer } from "node:http";
import { toNodeHandler } from "better-auth/node";
import { auth, authPool } from "./auth.js";
import { config, isAllowedReturnURL } from "./config.js";
import { consentPage, signInPage } from "./pages.js";

const authHandler = toNodeHandler(auth);

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
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok", issuer: `${config.baseURL}/api/auth` }));
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

        // Check if user already exists
        const existingUser = await authPool.query(
          'SELECT "id" FROM "user" WHERE "username" = $1 OR ("sentinelUserId" IS NOT NULL AND "sentinelUserId" = $2) OR "email" = $3 OR ("phoneNumber" IS NOT NULL AND "phoneNumber" = $4) LIMIT 1',
          [username, sentinelUserId || "", safeEmail, phoneNumber || ""],
        );

        let userId = existingUser.rows[0]?.id;
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
          await authPool.query(
            'UPDATE "user" SET "sentinelUserId" = COALESCE($1, "sentinelUserId"), "phoneNumber" = COALESCE($2, "phoneNumber"), "name" = COALESCE($3, "name"), "username" = COALESCE($4, "username") WHERE "id" = $5',
            [sentinelUserId || null, phoneNumber || null, name || null, username, userId],
          );
        }

        // Create or update credential account
        const existingAccount = await authPool.query(
          'SELECT "id" FROM "account" WHERE "userId" = $1 AND "providerId" = $2 LIMIT 1',
          [userId, "credential"],
        );
        if (existingAccount.rowCount) {
          await authPool.query(
            'UPDATE "account" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2',
            [hashedPassword, existingAccount.rows[0].id],
          );
        } else {
          const { randomBytes } = await import("node:crypto");
          const accountId = randomBytes(16).toString("hex");
          await authPool.query(
            'INSERT INTO "account" ("id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
            [accountId, userId, userId, "credential", hashedPassword],
          );
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
  if (url.pathname === "/sign-out" || url.pathname === "/logout") {
    const returnTo = url.searchParams.get("return_to") ?? config.sentinelWebURL;
    const safeReturn = isAllowedReturnURL(returnTo) ? returnTo : config.sentinelWebURL;
    response.writeHead(302, {
      location: safeReturn,
      "set-cookie": [
        "sentinel_auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        "sentinel_auth.session_data=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        "sentinel_auth.dont_remember=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
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
