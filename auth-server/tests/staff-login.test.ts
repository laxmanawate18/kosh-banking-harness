import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_DEMO_OTP = "246810";
process.env.AUTH_STAFF_USERNAME = "officer.mumbai";
process.env.AUTH_STAFF_PASSWORD = "Officer@2468";
process.env.AUTH_ADMIN_USERNAME = "admin.kosh";
process.env.AUTH_ADMIN_PASSWORD = "Admin@2468";

const { signInPage } = await import("../src/pages.js");

test("signInPage renders dummy credentials and fill buttons for Officer and Admin AI", () => {
  const html = signInPage();

  // Officer credentials in hint
  assert.match(html, /officer\.mumbai/);
  assert.match(html, /Officer@2468/);
  assert.match(html, /id="fillOfficer"/);

  // Admin AI credentials in hint
  assert.match(html, /admin\.kosh/);
  assert.match(html, /Admin@2468/);
  assert.match(html, /id="fillAdmin"/);

  // Customer Mobile OTP hint
  assert.match(html, /246810/);
});
