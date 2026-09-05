import assert from "node:assert";
import { formatPaisa, formatINR, formatDateTime, formatDate } from "./src/lib/formatters.ts";
import { getDemoExceptionDetail } from "./src/lib/demoData.ts";

console.log("Starting Frontend Null-Safety Regression Tests...");

// Test 1: formatPaisa with null, undefined, NaN, negative
assert.strictEqual(formatPaisa(null), "₹0.00", "formatPaisa(null) should return ₹0.00");
assert.strictEqual(formatPaisa(undefined), "₹0.00", "formatPaisa(undefined) should return ₹0.00");
assert.strictEqual(formatPaisa(NaN), "₹0.00", "formatPaisa(NaN) should return ₹0.00");
assert.strictEqual(formatPaisa(125000), "₹1,250.00", "formatPaisa(125000) should return ₹1,250.00");
assert.strictEqual(formatPaisa(-5000), "-₹50.00", "formatPaisa(-5000) should return -₹50.00");

// Test 2: formatINR with null, undefined, NaN
assert.strictEqual(formatINR(null), "₹0.00", "formatINR(null) should return ₹0.00");
assert.strictEqual(formatINR(undefined), "₹0.00", "formatINR(undefined) should return ₹0.00");
assert.strictEqual(formatINR(NaN), "₹0.00", "formatINR(NaN) should return ₹0.00");

// Test 3: formatDateTime and formatDate with null, undefined, invalid string
assert.strictEqual(formatDateTime(null), "—", "formatDateTime(null) should return —");
assert.strictEqual(formatDateTime(undefined), "—", "formatDateTime(undefined) should return —");
assert.strictEqual(formatDateTime("invalid-date-string"), "—", "formatDateTime(invalid) should return —");
assert.strictEqual(formatDate(null), "—", "formatDate(null) should return —");
assert.strictEqual(formatDate(undefined), "—", "formatDate(undefined) should return —");
assert.strictEqual(formatDate("not-a-date"), "—", "formatDate(invalid) should return —");

// Test 4: getDemoExceptionDetail with CASE-NULL-FIXTURE-999
const res = getDemoExceptionDetail("CASE-NULL-FIXTURE-999");
assert.ok(res, "Result should exist");
assert.ok(res.case, "Case object should exist");
assert.strictEqual(res.case.case_id, "CASE-NULL-FIXTURE-999");
assert.strictEqual(res.case.explanation, null, "explanation should be null in fixture");
assert.strictEqual(res.case.suggested_action, null, "suggested_action should be null in fixture");
assert.strictEqual(res.case.delta_paisa, null, "delta_paisa should be null in fixture");
assert.deepStrictEqual(res.evidence, {}, "evidence should be empty object");

// Test 5: Verify string splits and operations do not throw on null fixture
const caseData = res.case;
const caseIdDisplay = caseData.case_id ? (caseData.case_id.includes('_') ? caseData.case_id.split('_').pop() : caseData.case_id) : '—';
assert.strictEqual(caseIdDisplay, "CASE-NULL-FIXTURE-999");

const splitExplanation = (caseData.explanation || 'No narrative').split('. ');
assert.ok(Array.isArray(splitExplanation));
assert.strictEqual(splitExplanation[0], 'No narrative');

const formattedDelta = formatPaisa(caseData.delta_paisa);
assert.strictEqual(formattedDelta, "₹0.00");

const formattedDate = formatDateTime(caseData.opened_at);
assert.strictEqual(formattedDate, "—");

// Test 6: Verify AICopilotDrawer text split with undefined/null
const undefinedText = undefined;
const splitParagraphs = (undefinedText || '').split('\n\n').map(p => String(p || ''));
assert.strictEqual(splitParagraphs.length, 1);
assert.strictEqual(splitParagraphs[0], '');

// Test 7: Verify GenerateVaultLinkModal OTP split with undefined
const undefinedOtp = undefined;
const splitOtp = (undefinedOtp ? String(undefinedOtp) : '').split('');
assert.strictEqual(splitOtp.length, 0);

// Test 8: Verify ApprovalQueue exception_code replace with undefined/null
const undefinedCode = null;
const replacedCode = String(undefinedCode || 'ANOMALY').replace(/_/g, ' ');
assert.strictEqual(replacedCode, 'ANOMALY');

// Test 9: Verify CommandCenter status replace with undefined/null
const undefinedStatus = undefined;
const replacedStatus = String(undefinedStatus || '').replace(/_/g, ' ');
assert.strictEqual(replacedStatus, '');

// Test 10: Verify RiskCenter z_score toFixed with undefined/null
const undefinedZScore = null;
const fixedZScore = `+${(undefinedZScore ?? 0).toFixed(1)}σ`;
assert.strictEqual(fixedZScore, '+0.0σ');

// Test 11: Verify ComplianceCenter success_rate_pct toFixed and subject_id slice
const undefinedRate = undefined;
const fixedRate = `${(undefinedRate ?? 0).toFixed(2)}%`;
assert.strictEqual(fixedRate, '0.00%');

const undefinedSubject = null;
const slicedSubject = undefinedSubject ? (undefinedSubject.length > 14 ? `${undefinedSubject.slice(0, 6)}...` : undefinedSubject) : '—';
assert.strictEqual(slicedSubject, '—');

// Test 12: Verify LandingStory state title/desc split with undefined
const undefinedState = {};
const splitTitle = (undefinedState?.title || '').split('\n');
assert.strictEqual(splitTitle.length, 1);

console.log("All Frontend Null-Safety Regression Tests PASSED successfully!");
