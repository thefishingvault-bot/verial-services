import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const migrationsDir = path.join(repoRoot, "drizzle", "migrations");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  fail(`Missing migrations directory: ${migrationsDir}`);
}
if (!fs.existsSync(journalPath)) {
  fail(`Missing journal file: ${journalPath}`);
}

const migrationFiles = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".sql"))
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b));

const expectedTags = migrationFiles.map((file) => file.replace(/\.sql$/i, ""));

let journal;
try {
  journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
} catch (err) {
  fail(`Failed to parse journal JSON: ${err instanceof Error ? err.message : String(err)}`);
}

if (!journal || typeof journal !== "object") {
  fail("Journal JSON is not an object.");
}

const entries = Array.isArray(journal.entries) ? journal.entries : null;
if (!entries) {
  fail("Journal JSON missing 'entries' array.");
}

const journalTags = entries
  .map((e) => (e && typeof e === "object" ? e.tag : undefined))
  .filter((t) => typeof t === "string");

const missingInJournal = expectedTags.filter((tag) => !journalTags.includes(tag));
const extraInJournal = journalTags.filter((tag) => !expectedTags.includes(tag));

if (missingInJournal.length || extraInJournal.length) {
  if (missingInJournal.length) {
    console.error("Missing journal entries for migration files:");
    for (const tag of missingInJournal) console.error(`- ${tag}`);
  }
  if (extraInJournal.length) {
    console.error("Journal contains entries with no matching migration file:");
    for (const tag of extraInJournal) console.error(`- ${tag}`);
  }
  process.exit(1);
}

// Validate ordering and idx monotonicity (non-strict on 'when').
for (let i = 0; i < expectedTags.length; i++) {
  const entry = entries[i];
  const tag = entry?.tag;
  const idx = entry?.idx;

  if (tag !== expectedTags[i]) {
    fail(`Journal order mismatch at index ${i}: expected '${expectedTags[i]}', got '${tag}'.`);
  }
  if (idx !== i) {
    fail(`Journal idx mismatch for '${tag}': expected idx ${i}, got ${idx}.`);
  }
}

console.log(`OK: journal contains ${expectedTags.length} migrations and matches file order.`);
