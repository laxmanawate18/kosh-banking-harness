import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_DEMO_OTP = "246810";
const { verifyPhoneProof } = await import("../src/firebase-phone-plugin.js");

test("demo OTP mode accepts only a registered demo number with the demo code, and never uses Firebase", async () => {
  assert.deepEqual(await verifyPhoneProof({ phoneNumber: "+919876543210", code: "246810" }),
    { uid: "demo-+919876543210", phoneNumber: "+919876543210" });
  await assert.rejects(verifyPhoneProof({ phoneNumber: "+919876543210", code: "000000" }));
  await assert.rejects(verifyPhoneProof({ phoneNumber: "+911234567890", code: "246810" }));  // not a demo identity
  await assert.rejects(verifyPhoneProof({ idToken: "x".repeat(40) }));  // Firebase tokens are not accepted in demo mode
});
