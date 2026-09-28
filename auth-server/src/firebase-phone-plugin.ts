import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { config } from "./config.js";
import { verifyFirebasePhoneToken } from "./firebase.js";

const bodySchema = z.object({
  idToken: z.string().min(20),
  oauth_query: z.string().max(8192).optional().nullable(),
});
const stepUpBodySchema = z.object({
  idToken: z.string().min(20),
  sessionId: z.string().min(1).max(255),
});
const providerId = "firebase-phone";

function placeholderEmail(phoneNumber: string): string {
  const digest = createHash("sha256").update(phoneNumber).digest("hex").slice(0, 24);
  return `${digest}@phone.sentinel.invalid`;
}

export function firebasePhoneBridge(): BetterAuthPlugin {
  async function resolveUser(ctx: any, idToken: string) {
    let identity;
    try {
      identity = await verifyFirebasePhoneToken(idToken);
    } catch (error) {
      console.error("[firebase-plugin] verifyFirebasePhoneToken failed:", error);
      throw APIError.fromStatus("UNAUTHORIZED", {
        code: "INVALID_FIREBASE_TOKEN",
        message: error instanceof Error ? error.message : "Firebase token verification failed",
      });
    }

    const registered = config.firebaseIdentities[identity.phoneNumber];
    if (!registered) {
      console.error(
        `[firebase-plugin] Phone ${identity.phoneNumber} not registered. Registered:`,
        Object.keys(config.firebaseIdentities),
      );
      throw APIError.fromStatus("FORBIDDEN", {
        code: "PHONE_NOT_REGISTERED",
        message: `No active Kosh profile is linked to verified phone number ${identity.phoneNumber}`,
      });
    }

    const owner = await ctx.context.internalAdapter.findAccountOwnerByKey({
      providerId,
      accountId: identity.uid,
    });
    if (owner?.kind === "owned") return { user: owner.user, identity };
    if (owner?.kind === "orphaned") {
      throw APIError.fromStatus("CONFLICT", {
        code: "ORPHANED_FIREBASE_ACCOUNT",
        message: "The Firebase identity mapping requires administrator repair",
      });
    }

    let user = await ctx.context.adapter.findOne({
      model: "user",
      where: [{ field: "phoneNumber", operator: "eq", value: identity.phoneNumber }],
    });
    if (!user) {
      user = await ctx.context.internalAdapter.createUser(
        {
          name: registered.name,
          email: placeholderEmail(identity.phoneNumber),
          emailVerified: true,
          phoneNumber: identity.phoneNumber,
          sentinelUserId: registered.sentinelUserId,
        },
        { method: providerId },
      );
    }

    const existingAccount = await ctx.context.adapter.findOne({
      model: "account",
      where: [
        { field: "providerId", operator: "eq", value: providerId },
        { field: "accountId", operator: "eq", value: identity.uid },
      ],
    });
    if (!existingAccount) {
      await ctx.context.internalAdapter.createAccount({
        userId: user.id,
        providerId,
        accountId: identity.uid,
      });
    }
    return { user, identity };
  }

  return {
    id: "sentinel-firebase-phone",
    endpoints: {
      firebaseExchange: createAuthEndpoint(
        "/firebase/exchange",
        { method: "POST", body: bodySchema },
        async (ctx) => {
          try {
            const { user } = await resolveUser(ctx, ctx.body.idToken);
            const session = await ctx.context.internalAdapter.createSession(user.id, false, {
              assuranceLevel: "L2",
            });
            await setSessionCookie(ctx, { session, user });
            const oauthQuery = ctx.body.oauth_query?.trim();
            return ctx.json({
              authenticated: true,
              user: { id: user.id, name: user.name },
              redirect_uri: oauthQuery
                ? `/api/auth/oauth2/authorize?${oauthQuery}`
                : undefined,
            });
          } catch (err: any) {
            console.error("[firebaseExchange] Error:", err?.status, err?.message, err?.stack || err);
            throw err;
          }
        },
      ),
      firebaseStepUp: createAuthEndpoint(
        "/firebase/step-up",
        { method: "POST", body: stepUpBodySchema },
        async (ctx) => {
          const { user } = await resolveUser(ctx, ctx.body.idToken);
          const targetSession = await ctx.context.adapter.findOne({
            model: "session",
            where: [
              { field: "id", operator: "eq", value: ctx.body.sessionId },
              { field: "userId", operator: "eq", value: user.id },
            ],
          });
          const expiresAt = (targetSession as Record<string, unknown> | null)?.expiresAt;
          if (!targetSession || !expiresAt || new Date(String(expiresAt)).getTime() <= Date.now()) {
            throw APIError.fromStatus("UNAUTHORIZED", {
              code: "SESSION_MISMATCH",
              message: "The verified Firebase identity does not own this OAuth session",
            });
          }
          await ctx.context.adapter.update({
            model: "session",
            where: [{ field: "id", operator: "eq", value: ctx.body.sessionId }],
            update: {
              assuranceLevel: "L3",
              assuranceExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
            },
          });
          return ctx.json({ assuranceLevel: "L3", expiresIn: 300 });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
