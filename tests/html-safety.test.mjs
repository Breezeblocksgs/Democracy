import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeHtml, sanitizePlainText } from "../scripts/domain/html-safety.mjs";

test("escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<script>"'&`), "&lt;script&gt;&quot;&#39;&amp;");
});

test("passes plain text through unchanged", () => {
  assert.equal(escapeHtml("Should we raid the camp?"), "Should we raid the camp?");
});

test("coerces null/undefined to an empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("sanitizePlainText strips markup and truncates", () => {
  assert.equal(sanitizePlainText("<script>alert(1)</script>Hello"), "alert(1)Hello");
  assert.equal(sanitizePlainText("a".repeat(200), 10), "a".repeat(10));
});
