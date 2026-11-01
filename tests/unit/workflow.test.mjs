// Workflow file contract (F2-E and node graph). Structure only; behavior is proven by tests/integration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_PATH } from './load.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = readFileSync(join(ROOT, 'workflow', 'speed-to-lead.json'), 'utf8');
const wf = JSON.parse(raw);
const node = (t) => wf.nodes.filter((n) => n.type === t);

test('W1 only stock n8n-nodes-base nodes; one webhook, one Code, one SMTP send', () => {
  for (const n of wf.nodes) assert.match(n.type, /^n8n-nodes-base\./, n.type);
  assert.equal(node('n8n-nodes-base.webhook').length, 1);
  assert.equal(node('n8n-nodes-base.code').length, 1);
  assert.equal(node('n8n-nodes-base.emailSend').length, 1);
});

test('W2 webhook is POST /speed-to-lead answered by Respond nodes', () => {
  const [w] = node('n8n-nodes-base.webhook');
  assert.equal(w.parameters.httpMethod, 'POST');
  assert.equal(w.parameters.path, 'speed-to-lead');
  assert.equal(w.parameters.responseMode, 'responseNode');
});

test('W3 Code node runs the unit-tested policy verbatim', () => {
  const [c] = node('n8n-nodes-base.code');
  assert.ok(c.parameters.jsCode.includes(readFileSync(POLICY_PATH, 'utf8')));
});

test('W4 SMTP node: plain text, fields from the policy output, error output wired', () => {
  const [m] = node('n8n-nodes-base.emailSend');
  assert.equal(m.parameters.emailFormat, 'text');
  assert.equal(m.parameters.toEmail, '={{ $json.mail.to }}');
  assert.equal(m.parameters.fromEmail, '={{ $json.mail.from }}');
  assert.equal(m.onError, 'continueErrorOutput');
  assert.equal(wf.connections[m.name].main.length, 2);
});

test('W5 no credential values, pinned data, private endpoints or personal data', () => {
  assert.deepEqual(wf.pinData || {}, {});
  for (const n of wf.nodes) for (const c of Object.values(n.credentials || {})) assert.deepEqual(Object.keys(c).sort(), ['id', 'name']);
  assert.doesNotMatch(raw, /password|apiKey|secret|token/i);
  assert.doesNotMatch(raw, /https?:\/\/(?!localhost)/);
  const emails = raw.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  for (const e of emails) assert.match(e, /@example\.(com|test)$/, e);
});

test('W6 failures stop the execution (Stop and Error after the 502 response)', () => {
  assert.equal(node('n8n-nodes-base.stopAndError').length, 1);
});

// n8n Creator Hub sticky-note guidelines (read 2026-10-20, see channel/RULES.md).
test('W7 exactly one yellow overview sticky, top-left, 100-300 words, with How it works + Setup', () => {
  const stickies = node('n8n-nodes-base.stickyNote');
  const yellow = stickies.filter((s) => (s.parameters.color ?? 1) === 1);
  assert.equal(yellow.length, 1);
  const [main] = yellow;
  const others = wf.nodes.filter((n) => n !== main);
  assert.ok(others.every((n) => n.position[0] >= main.position[0] && n.position[1] >= main.position[1]), 'overview sticky is top-left');
  const words = main.parameters.content.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 100 && words <= 300, `${words} words`);
  assert.match(main.parameters.content, /^### How it works$/m);
  assert.match(main.parameters.content, /^### Setup$/m);
});

test('W8 white section stickies (<50 words each) group the workflow', () => {
  const sections = node('n8n-nodes-base.stickyNote').filter((s) => s.parameters.color === 7);
  assert.ok(sections.length >= 2);
  for (const s of sections) assert.ok(s.parameters.content.split(/\s+/).filter(Boolean).length < 50);
});
