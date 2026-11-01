// Lead policy tests (see README). Pure: no n8n, no SMTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from './load.mjs';

const { evaluateLead, LIMITS } = loadPolicy();
const cfg = { notify_to: 'leads@example.com', notify_from: 'n8n@example.com' };
const good = { name: 'Sam Tester', email: 'sam@example.test', message: 'Need a quote\nfor 3 rooms.' };
const ev = (body, c = cfg) => evaluateLead(body, c);

test('L1 valid lead -> accepted mail to the configured mailbox, Reply-To = lead email', () => {
  const r = ev(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.mail, {
    to: 'leads@example.com', from: 'n8n@example.com', replyTo: 'sam@example.test',
    subject: 'New lead: Sam Tester',
    text: 'New lead from the website form.\n\nName: Sam Tester\nEmail: sam@example.test\n\nMessage:\nNeed a quote\nfor 3 rooms.\n',
  });
});

test('L2 recipient and sender come only from configuration, never from input', () => {
  const r = ev({ ...good, to: 'evil@example.net', from: 'x@example.net', notify_to: 'evil@example.net', cc: 'e@example.net' });
  assert.equal(r.ok, true);
  assert.equal(r.mail.to, 'leads@example.com');
  assert.equal(r.mail.from, 'n8n@example.com');
  assert.doesNotMatch(JSON.stringify(r.mail), /example\.net/);
});

test('L3 missing fields -> reasons, no mail', () => {
  const r = ev({});
  assert.equal(r.ok, false);
  assert.equal(r.mail, undefined);
  assert.deepEqual(r.reasons, ['name_required', 'email_invalid', 'message_required']);
});

test('L4 non-object bodies are rejected', () => {
  for (const b of [null, [], 'x', 3]) assert.deepEqual(ev(b).reasons, ['body_not_object']);
});

test('L5 header injection: CR/LF or control chars in name/email are rejected', () => {
  assert.deepEqual(ev({ ...good, name: 'Sam\r\nBcc: victim@example.net' }).reasons, ['name_invalid']);
  assert.deepEqual(ev({ ...good, name: 'Sam\nX' }).reasons, ['name_invalid']);
  assert.deepEqual(ev({ ...good, email: 'sam@example.test\r\nBcc: victim@example.net' }).reasons, ['email_invalid']);
  assert.deepEqual(ev({ ...good, message: 'hi\u0000there' }).reasons, ['message_invalid']);
  assert.deepEqual(ev({ ...good, message: 'a\tb' }).reasons, ['message_invalid']); // only line breaks are allowed
  assert.equal(ev({ ...good, message: 'a\r\nb' }).ok, true);
  // address lists / display names could add Reply-To targets
  for (const e of ['a,evil@example.net', 'Sam <sam@example.test>', 'a;b@example.test', '"a b"@example.test'])
    assert.deepEqual(ev({ ...good, email: e }).reasons, ['email_invalid'], e);
});

test('L6 size bounds are enforced (name 100, email 254, message 2000)', () => {
  assert.deepEqual(LIMITS, { name: 100, email: 254, message: 2000, body: 16384 });
  assert.equal(ev({ ...good, name: 'a'.repeat(100) }).ok, true);
  assert.deepEqual(ev({ ...good, name: 'a'.repeat(101) }).reasons, ['name_too_long']);
  assert.equal(ev({ ...good, message: 'm'.repeat(2000) }).ok, true);
  assert.deepEqual(ev({ ...good, message: 'm'.repeat(2001) }).reasons, ['message_too_long']);
  assert.deepEqual(ev({ ...good, email: `${'a'.repeat(250)}@x.io` }).reasons, ['email_invalid']);
});

test('L7 non-string fields are rejected, values are trimmed', () => {
  assert.deepEqual(ev({ ...good, name: 42 }).reasons, ['name_required']);
  const r = ev({ name: '  Sam  ', email: ' Sam@Example.TEST ', message: '  hi  ' });
  assert.equal(r.mail.subject, 'New lead: Sam');
  assert.equal(r.mail.replyTo, 'sam@example.test');
});

test('L9 Unicode line separators and C1 controls are rejected in name and message (U+0085, U+2028, U+2029)', () => {
  for (const ch of ['\u0085', '\u2028', '\u2029', '\u0080', '\u009f']) {
    const hex = ch.charCodeAt(0).toString(16);
    assert.deepEqual(ev({ ...good, name: `Sam${ch}Bcc: victim@example.net` }).reasons, ['name_invalid'], `name U+${hex}`);
    assert.deepEqual(ev({ ...good, message: `hi${ch}there` }).reasons, ['message_invalid'], `message U+${hex}`);
  }
  assert.equal(ev({ ...good, name: 'Zoë Ñúñez 李' }).ok, true); // ordinary non-ASCII letters stay valid
  assert.equal(ev({ ...good, message: 'line 1\nline 2' }).ok, true); // \n stays allowed in message
});

test('L10 total body bound: serialized JSON body over 16384 characters -> body_too_large, before field checks', () => {
  assert.equal(LIMITS.body, 16384);
  const pad = (n) => ({ ...good, extra: 'x'.repeat(n - JSON.stringify({ ...good, extra: '' }).length) });
  assert.equal(JSON.stringify(pad(16384)).length, 16384);
  assert.equal(ev(pad(16384)).ok, true);
  assert.deepEqual(ev(pad(16385)).reasons, ['body_too_large']);
  assert.deepEqual(ev({ ...good, extra: 'x'.repeat(1024 * 1024) }).reasons, ['body_too_large']);
  // the largest valid lead (every field at its limit, message all line breaks) fits under the bound
  const max = { name: 'n'.repeat(100), email: `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}`, message: 'm' + '\n'.repeat(1998) + 'm' };
  assert.equal(max.email.length, 250);
  assert.ok(JSON.stringify(max).length < 16384);
  assert.equal(ev(max).ok, true);
});

test('L8 invalid configuration is reported as config error, not sent', () => {
  const r = ev(good, { notify_to: 'change-me', notify_from: 'n8n@example.com' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasons, ['config_invalid']);
});
