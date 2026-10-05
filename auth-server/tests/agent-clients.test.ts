import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentClients } from "../src/config.js";

test("the bank registers each outside agent explicitly", () => {
  assert.deepEqual(parseAgentClients(undefined), []);
  const [claude] = parseAgentClients(JSON.stringify([
    { id: "kosh-agent-claude", name: "Claude", redirects: ["https://claude.ai/api/mcp/auth_callback"], scopes: ["banking.read"] },
  ]));
  assert.equal(claude?.id, "kosh-agent-claude");
});

test("agent clients without redirects or with unknown scopes are refused", () => {
  assert.throws(() => parseAgentClients(JSON.stringify([{ id: "a", name: "A", redirects: [] }])));
  assert.throws(() => parseAgentClients(JSON.stringify([{ id: "a", name: "A", redirects: ["https://x"], scopes: ["banking.execute"] }])));
  assert.throws(() => parseAgentClients(JSON.stringify({ id: "a" })));
});
