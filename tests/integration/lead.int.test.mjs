// F2 integration tests against the REAL n8n + Mailpit stack started by tests/integration/run.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const N8N = process.env.N8N_URL;
const MP = process.env.MAILPIT_URL;
const sample = JSON.parse(readFileSync(join(HERE, '..', '..', 'sample-lead.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body, raw = false) {
  const t0 = Date.now();
  const res = await fetch(`${N8N}/webhook/speed-to-lead`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, ms: Date.now() - t0 };
}
const mails = async () => (await (await fetch(`${MP}/api/v1/messages`)).json()).messages || [];
const clear = () => fetch(`${MP}/api/v1/messages`, { method: 'DELETE' });
const full = async (id) => (await fetch(`${MP}/api/v1/message/${id}`)).json();
async function settledCount(waitMs = 3000) { await sleep(waitMs); return (await mails()).length; }

test('F2-A/B valid sample -> 202 and exactly one captured mail with expected recipient, subject, body', async () => {
  await clear();
  const r = await post(sample);
  console.log(`# valid lead response ${r.status} in ${r.ms} ms`);
  assert.equal(r.status, 202, r.text);
  assert.deepEqual(r.json, { status: 'accepted' });
  assert.equal(await settledCount(), 1);
  const [m] = await mails();
  const f = await full(m.ID);
  assert.deepEqual(f.To.map((x) => x.Address), ['leads@example.com']);
  assert.equal(f.From.Address, 'n8n@example.com');
  assert.deepEqual(f.ReplyTo.map((x) => x.Address), [sample.email]);
  assert.deepEqual(f.Cc || [], []);
  assert.deepEqual(f.Bcc || [], []);
  assert.equal(f.Subject, `New lead: ${sample.name}`);
  assert.equal(f.Text.replace(/\r\n/g, '\n').trim(),
    `New lead from the website form.\n\nName: ${sample.name}\nEmail: ${sample.email}\n\nMessage:\n${sample.message}`.trim());
  assert.equal(f.HTML, '');
});

test('F2-C missing/invalid fields -> 400 with reasons and no mail', async () => {
  await clear();
  const r = await post({ name: '', email: 'nope' });
  assert.equal(r.status, 400, r.text);
  assert.deepEqual(r.json, { status: 'invalid', reasons: ['name_required', 'email_invalid', 'message_required'] });
  const r2 = await post('not json at all', true);
  assert.ok(r2.status >= 400 && r2.status < 500, `non-JSON body status ${r2.status}`);
  assert.equal(await settledCount(), 0);
});

test('F2-C hostile newlines cannot add recipients or headers', async () => {
  await clear();
  const cases = [
    { ...sample, name: 'Eve\r\nBcc: victim@example.test' },
    { ...sample, email: 'eve@example.test\r\nBcc: victim@example.test' },
    { ...sample, email: 'eve@example.test,victim@example.test' },
  ];
  for (const c of cases) assert.equal((await post(c)).status, 400);
  const ok = await post({ ...sample, to: 'victim@example.test', notify_to: 'victim@example.test', message: 'hi\r\nBcc: victim@example.test' });
  assert.equal(ok.status, 202);
  assert.equal(await settledCount(), 1);
  const f = await full((await mails())[0].ID);
  const all = [...f.To, ...(f.Cc || []), ...(f.Bcc || [])].map((x) => x.Address);
  assert.deepEqual(all, ['leads@example.com']);
  const headers = await (await fetch(`${MP}/api/v1/message/${f.ID}/headers`)).json();
  assert.equal(headers.Bcc, undefined);
});

test('F2-C oversized inputs fail with the documented bound', async () => {
  await clear();
  assert.deepEqual((await post({ ...sample, message: 'x'.repeat(2001) })).json.reasons, ['message_too_long']);
  assert.deepEqual((await post({ ...sample, name: 'x'.repeat(101) })).json.reasons, ['name_too_long']);
  assert.equal((await post({ ...sample, message: 'x'.repeat(2000) })).status, 202);
  assert.equal(await settledCount(), 1);
});

test('F2-C Unicode line separators / C1 controls (U+0085, U+2028, U+2029) in name or message -> 400, no mail', async () => {
  await clear();
  for (const ch of ['\u0085', '\u2028', '\u2029']) {
    const hex = ch.charCodeAt(0).toString(16);
    const n = await post({ ...sample, name: `Eve${ch}Bcc: victim@example.test` });
    assert.equal(n.status, 400, `name U+${hex}: ${n.text}`);
    assert.deepEqual(n.json.reasons, ['name_invalid']);
    const m = await post({ ...sample, message: `hi${ch}there` });
    assert.equal(m.status, 400, `message U+${hex}: ${m.text}`);
    assert.deepEqual(m.json.reasons, ['message_invalid']);
  }
  assert.equal(await settledCount(), 0);
});

test('F2-C total body bound: 1 MB body with an extra field -> 400 body_too_large, no mail', async () => {
  await clear();
  const r = await post({ ...sample, extra: 'x'.repeat(1024 * 1024) });
  assert.equal(r.status, 400, r.text);
  assert.deepEqual(r.json, { status: 'invalid', reasons: ['body_too_large'] });
  const big = await post(JSON.stringify({ ...sample, extra: 'x'.repeat(17 * 1024 * 1024) }), true);
  console.log(`# 17 MiB body (over n8n's default 16 MiB N8N_PAYLOAD_SIZE_MAX) -> ${big.status} ${big.text.slice(0, 200)}`);
  assert.ok(big.status >= 400, `17 MiB body status ${big.status}`); // n8n 2.43.4 answers 500 here, not 413
  assert.notDeepEqual(big.json, { status: 'accepted' });
  assert.equal(await settledCount(), 0);
});

test('F2-D repeat requests create repeated messages (no deduplication, documented)', async () => {
  await clear();
  assert.equal((await post(sample)).status, 202);
  assert.equal((await post(sample)).status, 202);
  assert.equal(await settledCount(), 2);
});

// "Unavailable" here = the SMTP host cannot be resolved/reached (Mailpit detached from the network).
// A host that silently drops packets is slower: see README "Webhook response timing".
const NET = `${process.env.COMPOSE_PROJECT_NAME}_default`;
const mailContainer = () => execFileSync('docker', ['compose', 'ps', '-q', 'mail'], { encoding: 'utf8' }).trim();
test('F2-D SMTP unavailable -> 502 delivered:false, execution failed, no mail captured', async () => {
  await clear();
  const id = mailContainer();
  execFileSync('docker', ['network', 'disconnect', NET, id], { stdio: 'ignore' });
  try {
    const r = await post(sample);
    console.log(`# SMTP-unreachable response ${r.status} in ${r.ms} ms`);
    assert.equal(r.status, 502, r.text);
    assert.deepEqual(r.json, { status: 'error', delivered: false });
    const st = execFileSync('docker', ['compose', 'exec', '-T', 'n8n', 'node', '-e',
      "const s=require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');const d=new s.Database('/home/node/.n8n/database.sqlite',1);" +
      "d.all('select status from execution_entity order by id desc limit 1',(e,r)=>{if(e)throw e;console.log(r[0].status)})"], { encoding: 'utf8' }).trim();
    assert.equal(st, 'error', 'n8n execution is recorded as failed');
  } finally {
    execFileSync('docker', ['network', 'connect', '--alias', 'mail', NET, id], { stdio: 'ignore' });
  }
  await sleep(2000);
  assert.equal((await mails()).length, 0, 'no message was captured for the failed send');
});
