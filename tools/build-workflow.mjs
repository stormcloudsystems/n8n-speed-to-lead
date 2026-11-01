#!/usr/bin/env node
// Builds workflow/speed-to-lead.json. src/lead-policy.js is pasted VERBATIM into the Code node, so n8n runs
// exactly the unit-tested policy (tests/unit/workflow.test.mjs W3). Re-run after editing src/ or this file:
//   node tools/build-workflow.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = readFileSync(join(ROOT, 'src', 'lead-policy.js'), 'utf8');
const json = (o) => `={{ JSON.stringify(${o}) }}`;
const respond = (name, pos, body, code) => ({
  name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position: pos,
  parameters: { respondWith: 'json', responseBody: json(body), options: { responseCode: code } },
});

const nodes = [
  {
    name: 'Overview', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-760, -420],
    parameters: { color: 1, width: 480, height: 640, content: [
      '## Send an e-mail for every new website lead',
      '',
      'Your website form posts a lead (name, e-mail, message) to this workflow. A valid lead becomes one plain-text',
      'e-mail to the mailbox you choose, with Reply-To set to the lead, so you can answer with one click.',
      '',
      '### How it works',
      '1. **Lead webhook** receives a JSON POST.',
      '2. **Settings** holds your notification mailbox and sender address.',
      '3. **Validate lead** checks the fields (lengths, one plain e-mail address, no line breaks in name or e-mail).',
      '   The recipient never comes from the request.',
      '4. **Send notification** sends the e-mail through your SMTP server and answers 202.',
      '   Invalid leads get 400 with reasons; a failed send gets 502 and the execution is marked failed.',
      '',
      '### Setup',
      '1. Open **Settings** and set `notify_to` and `notify_from`.',
      '2. Open **Send notification** and select or create your SMTP credential.',
      '3. Publish the workflow and post to `/webhook/speed-to-lead`.',
      '',
      'Repeat submissions send repeat e-mails (no deduplication). SMTP acceptance is not proof of inbox delivery.',
    ].join('\n') },
  },
  {
    name: 'Section: receive', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-240, -120],
    parameters: { color: 7, width: 600, height: 280, content: '## 1. Receive and check the lead\nEdit Settings for your mailbox.' },
  },
  {
    name: 'Section: send', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [560, -280],
    parameters: { color: 7, width: 700, height: 560, content: '## 2. Notify and answer\nOne e-mail per valid lead; 400 or 502 otherwise.' },
  },
  {
    name: 'Lead webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [-200, 0], webhookId: 'speed-to-lead',
    parameters: { httpMethod: 'POST', path: 'speed-to-lead', responseMode: 'responseNode', options: {} },
  },
  {
    name: 'Settings', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [0, 0],
    parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
      { id: 'notify-to', name: 'notify_to', type: 'string', value: 'leads@example.com' },
      { id: 'notify-from', name: 'notify_from', type: 'string', value: 'n8n@example.com' },
    ] }, options: {} },
  },
  {
    name: 'Validate lead', type: 'n8n-nodes-base.code', typeVersion: 2, position: [200, 0],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode:
      `${policy}\n// ---- n8n glue ----\nconst body = $('Lead webhook').first().json.body;\nconst config = $('Settings').first().json;\nreturn [{ json: evaluateLead(body, config) }];\n` },
  },
  {
    name: 'Valid?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [400, 0],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'is-ok', leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, options: {} },
  },
  {
    name: 'Send notification', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: [620, -100], onError: 'continueErrorOutput',
    credentials: { smtp: { id: 'speedToLeadSmtp1', name: 'SMTP account' } },
    parameters: { fromEmail: '={{ $json.mail.from }}', toEmail: '={{ $json.mail.to }}', subject: '={{ $json.mail.subject }}',
      emailFormat: 'text', text: '={{ $json.mail.text }}', options: { appendAttribution: false, replyTo: '={{ $json.mail.replyTo }}' } },
  },
  respond('Respond 202', [860, -200], "{ status: 'accepted' }", 202),
  respond('Respond 502', [860, 0], "{ status: 'error', delivered: false }", 502),
  { name: 'Mark execution failed', type: 'n8n-nodes-base.stopAndError', typeVersion: 1, position: [1080, 0],
    parameters: { errorMessage: 'SMTP send failed; no e-mail was delivered for this lead' } },
  respond('Respond 400', [620, 160], "{ status: 'invalid', reasons: $json.reasons }", 400),
];
const link = (to) => [{ node: to, type: 'main', index: 0 }];
const connections = {
  'Lead webhook': { main: [link('Settings')] },
  Settings: { main: [link('Validate lead')] },
  'Validate lead': { main: [link('Valid?')] },
  'Valid?': { main: [link('Send notification'), link('Respond 400')] },
  'Send notification': { main: [link('Respond 202'), link('Respond 502')] },
  'Respond 502': { main: [link('Mark execution failed')] },
};
const wf = {
  id: 'SpeedToLeadFree1', name: 'Speed-to-lead notification (free)', active: false, nodes, connections, pinData: {},
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all' }, tags: [],
};
writeFileSync(join(ROOT, 'workflow', 'speed-to-lead.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('wrote workflow/speed-to-lead.json');
