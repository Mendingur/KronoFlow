import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('./firestore.rules', 'utf8');

test('Dirty Dozen Security Rules Invariants Verification', () => {
  // 1. Default deny catch-all
  assert.ok(rules.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  // 2. Email verified check enforced
  assert.ok(rules.includes('request.auth.token.email_verified == true'));
  // 3. Path Variable Hardening (ID Poisoning Guard)
  assert.ok(rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));
  // 4. Anti-Update-Gap blueprint helpers wrapped on create & update
  assert.ok(rules.includes('isValidUserSettings(incoming())'));
  assert.ok(rules.includes('isValidTransaction(incoming())'));
  assert.ok(rules.includes('isValidHabit(incoming())'));
  assert.ok(rules.includes('isValidTask(incoming())'));
  // 5. Relational Master Gate parent check
  assert.ok(rules.includes('parentUserExists(userId)'));
  // 6. Temporal integrity server timestamps
  assert.ok(rules.includes('incoming().createdAt == request.time'));
  assert.ok(rules.includes('incoming().updatedAt == request.time'));
});
