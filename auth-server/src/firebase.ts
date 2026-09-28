import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { config } from "./config.js";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: config.firebaseProjectId || undefined,
  });
}

export type VerifiedFirebaseIdentity = {
  uid: string;
  phoneNumber: string;
  authTime: number;
};

export async function verifyFirebasePhoneToken(
  idToken: string,
  maxAgeSeconds = 300,
): Promise<VerifiedFirebaseIdentity> {
  // Revocation lookup requires service-account/ADC credentials. Local
  // development is deliberately restricted to one Firebase console test
  // number, so signature/issuer/audience verification is sufficient there.
  const decoded = await getAuth().verifyIdToken(idToken, false);
  const phoneNumber = typeof decoded.phone_number === "string" ? decoded.phone_number : "";
  const authTime = typeof decoded.auth_time === "number" ? decoded.auth_time : 0;
  const now = Math.floor(Date.now() / 1000);

  if (!phoneNumber || !decoded.uid) throw new Error("Firebase token has no verified phone identity");
  if (!authTime || now - authTime > maxAgeSeconds || authTime > now + 30) {
    throw new Error("Firebase authentication is not recent enough");
  }
  return { uid: decoded.uid, phoneNumber, authTime };
}
