import assert from "node:assert/strict";
import { ensureUserRecord, USER_WITH_MEMBERSHIPS_SELECT } from "../lib/auth-user-record";

async function main() {
  assert.match(USER_WITH_MEMBERSHIPS_SELECT, /BusinessProfile!BusinessProfile_organisationId_fkey/);
  assert.match(USER_WITH_MEMBERSHIPS_SELECT, /OrganisationMember\(\*,/);
  let row: { id: string; supabaseId: string; email: string } | null = {
    id: "legacy-user-with-referenced-packs", supabaseId: "auth-id", email: "existing@example.test",
  };
  const db = {
    from(table: string) {
      assert.equal(table, "User");
      return {
        async upsert(value: typeof row, options: { ignoreDuplicates: boolean; onConflict: string }) {
          assert.equal(options.onConflict, "supabaseId");
          assert.equal(options.ignoreDuplicates, true, "existing IDs must never be overwritten");
          if (!row) row = value;
          return { error: null };
        },
        select(column: string) {
          assert.equal(column, "id");
          return { eq(key: string, value: string) {
            assert.equal(key, "supabaseId");
            assert.equal(value, "auth-id");
            return { single: async () => ({ data: row, error: null }) };
          } };
        },
      };
    },
  };
  assert.equal((await ensureUserRecord(db as never, "auth-id", "new@example.test")).id, "legacy-user-with-referenced-packs");
  row = null;
  assert.equal((await ensureUserRecord(db as never, "auth-id", "new@example.test")).id, "user-auth-id");
  console.log("Auth provisioning regression checks passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
