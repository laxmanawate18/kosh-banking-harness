import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageFile = join(root, "node_modules", "@better-auth", "oauth-provider", "package.json");
const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
if (packageJson.version !== "1.7.6") {
  throw new Error(`Unsupported @better-auth/oauth-provider version ${packageJson.version}; review the refresh-scope patch`);
}

const dist = join(root, "node_modules", "@better-auth", "oauth-provider", "dist");
const candidates = (await readdir(dist))
  .filter((name) => name.startsWith("introspect-") && name.endsWith(".mjs"))
  .map((name) => join(dist, name));
const needle = "\t\tscopes,\n\t\tresources,\n\t\tcreatedAt:";
const replacement = "\t\tscopes: scopes.includes(\"offline_access\") ? scopes : [...scopes, \"offline_access\"],\n\t\tresources,\n\t\tcreatedAt:";

let patched = false;
for (const candidate of candidates) {
  const source = await readFile(candidate, "utf8");
  if (source.includes(replacement)) {
    patched = true;
    continue;
  }
  if (!source.includes(needle)) continue;
  await writeFile(candidate, source.replace(needle, replacement));
  patched = true;
}
if (!patched) throw new Error("Could not apply the Better Auth refresh-scope compatibility patch");

