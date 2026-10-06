import { createHash, timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { config } from "./config.js";
import { verifyFirebasePhoneToken } from "./firebase.js";

// A Firebase ID token, or in demo OTP mode (AUTH_DEMO_OTP) a registered demo number and the demo code.
const proofSchema = {
  idToken: z.string().min(20).optional(),
  phoneNumber: z.string().max(20).optional(),
  code: z.string().max(12).optional(),
};
const bodySchema = z.object({ ...proofSchema, oauth_query: z.string().max(8192).optional().nullable() });
const stepUpBodySchema = z.object({ ...proofSchema, sessionId: z.string().min(1).max(255) });

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Demo OTP mode never sends an SMS: only the registered demo numbers, with the configured demo code, can sign in. */
export async function verifyPhoneProof(body: { idToken?: string; phoneNumber?: string; code?: string }) {
  if (config.demoOtp) {
    const phoneNumber = body.phoneNumber ?? "";
    if (!config.firebaseIdentities[phoneNumber] || !sameCode(body.code ?? "", config.demoOtp)) {
      throw new Error("The demo number or code is incorrect");
    }
    return { uid: `demo-${phoneNumber}`, phoneNumber };
  }
  if (!body.idToken) throw new Error("A verified phone token is required");
  return verifyFirebasePhoneToken(body.idToken);
}
const providerId = "firebase-phone";

function placeholderEmail(phoneNumber: string): string {
  const digest = createHash("sha256").update(phoneNumber).digest("hex").slice(0, 24);
  return `${digest}@phone.sentinel.invalid`;
}

export function firebasePhoneBridge(): BetterAuthPlugin {
  async function resolveUser(ctx: any, proof: { idToken?: string; phoneNumber?: string; code?: string }) {
    let identity;
    try {
      identity = await verifyPhoneProof(proof);
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
            const { user } = await resolveUser(ctx, ctx.body);
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
          const { user } = await resolveUser(ctx, ctx.body);
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
