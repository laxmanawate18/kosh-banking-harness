import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedReturnURL } from "../src/config.js";

test("return URLs stay on the Sentinel web origin", () => {
  assert.equal(isAllowedReturnURL("/accounts"), true);
  assert.equal(isAllowedReturnURL("http://127.0.0.1:8017/accounts"), true);
  assert.equal(isAllowedReturnURL("http://localhost:8017/accounts"), false);
  assert.equal(isAllowedReturnURL("https://attacker.example/callback"), false);
  assert.equal(isAllowedReturnURL("//attacker.example/callback"), false);
});
