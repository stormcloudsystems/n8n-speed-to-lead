# n8n-speed-to-lead

One n8n workflow that turns a website form submission into an e-mail to you. Your form posts a lead (name,
e-mail, message) to an n8n webhook; a valid lead becomes one plain-text e-mail to the mailbox you choose, with
Reply-To set to the lead so you can answer with one click. Invalid input is refused before anything is sent.

Free and MIT-licensed, from Storm Cloud Systems. Stock n8n nodes only: Webhook, Set, Code, If, Send Email,
Respond to Webhook, Stop and Error. No database, no community nodes.

## What you need

- A self-hosted n8n 2.x instance. Tested only on n8n **2.43.4** (Docker image `n8nio/n8n:2.43.4`). Other versions
  were not tested.
- An SMTP server n8n can reach (your mail provider's SMTP, or a local test server such as Mailpit).
- A website form, or anything else that can send an HTTP `POST` with a JSON body.

## Setup

Follow [CHECKLIST.md](CHECKLIST.md) (one page). In short: import `workflow/speed-to-lead.json`, set your two
addresses in the **Settings** node, select your SMTP credential in **Send notification**, publish, then post a
test lead.

## The contract

`POST /webhook/speed-to-lead` with `content-type: application/json`:

```json
{ "name": "Sam Example", "email": "sam@example.test", "message": "Hi, we need a quote." }
```

| Field | Rule |
|---|---|
| `name` | required, 1 to 100 characters after trimming, no line breaks or control characters (this includes C1 controls such as U+0085 and the Unicode separators U+2028/U+2029) |
| `email` | required, one plain address (no display name, no comma or semicolon lists), at most 254 characters |
| `message` | required, 1 to 2000 characters after trimming; `\n` and `\r\n` line breaks allowed; tabs, other control characters (C0, C1 such as U+0085) and U+2028/U+2029 not |
| anything else | ignored, but counts towards the total body bound |
| whole body | at most 16384 characters, measured as the JSON re-serialization of the parsed body (`JSON.stringify(body).length`); larger bodies get `400` with `body_too_large` before any field is checked |

Bodies above n8n's own request limit (`N8N_PAYLOAD_SIZE_MAX`, in MiB, default 16 in n8n 2.43.4) are not
accepted; in our test n8n 2.43.4 answered a 17 MiB body with `500` ("There was a problem executing the workflow")
and no e-mail was sent. Between 16384
characters and that limit, n8n still receives and parses the whole body before the workflow refuses it.

| Response | When |
|---|---|
| `202 {"status":"accepted"}` | the SMTP server accepted the notification e-mail |
| `400 {"status":"invalid","reasons":[...]}` | validation failed; nothing was sent. Reasons: `body_not_object`, `body_too_large`, `name_required`, `name_too_long`, `name_invalid`, `email_invalid`, `message_required`, `message_too_long`, `message_invalid`, `config_invalid` (your Settings addresses are not valid) |
| `502 {"status":"error","delivered":false}` | the SMTP send failed; the n8n execution is marked as failed |
| other 4xx from n8n | the body was not valid JSON (n8n rejects it before the workflow runs) |

The e-mail: To = `notify_to`, From = `notify_from` (both from **Settings**, never from the request), Reply-To = the
lead's address, Subject = `New lead: <name>`, plain-text body with name, e-mail and message.

## Limitations (read these)

- **Repeat submissions send repeat e-mails.** There is no deduplication, no retry queue and no storage of leads.
- **202 means the SMTP server accepted the message, not that it reached an inbox.** Spam filters and bounces
  happen after that point and are not visible to this workflow.
- **Response timing depends on your SMTP server.** The webhook answers only after the send finishes. In our
  tests a valid lead got its 202 in about 0.25 to 0.9 seconds (local Mailpit). With the SMTP host unreachable,
  the 502 took between 39 and 120 seconds across seven runs; with the test SMTP container stopped (its address no
  longer answering) one attempt took longer than 2 minutes. Forms with short timeouts may give up first. These
  are measurements on one machine, not guarantees.
- **The webhook is public.** Anyone who knows the URL can make you receive e-mails. Add rate limiting, a CAPTCHA
  or n8n's webhook authentication if that matters to you.
- No speed-to-lead or conversion figures are claimed; none were measured.

## Tests

Unit tests for the validation logic and the workflow file (Node.js 22 or later, no n8n needed):

```sh
node --test 'tests/unit/*.test.mjs'
```

Real-runtime integration test: starts a clean, throw-away stock n8n 2.43.4 and Mailpit (pinned by digest) with
Docker Compose, imports this exact workflow, sets an SMTP credential pointing at Mailpit, publishes it, calls the
real webhook and checks the captured e-mails, then deletes the stack. No real e-mail is sent.

```sh
sh tests/integration/run.sh
```

Needs Docker Engine with Compose v2, Node.js 22 or later, `curl`, and free local ports 15678 and 18025 (change
with `F2_N8N_PORT` / `F2_MAIL_PORT`). It checks: one valid lead gives exactly one e-mail with the expected
recipient, sender, Reply-To, subject and body; missing or invalid fields give 400 and no e-mail; line breaks
cannot add recipients or headers; size limits; repeat submissions give repeat e-mails; an unreachable SMTP server
gives 502, a failed execution and no e-mail; U+0085/U+2028/U+2029 in name or message and a 1 MB body give 400 and
no e-mail.

Tested on 2026-10-20: Linux x86_64, Docker 29.7.2, Compose 5.5.0, Node.js 26.8.1 (test runner), n8n 2.43.4,
Mailpit 1.27.

`src/lead-policy.js` is the validation logic; `tools/build-workflow.mjs` pastes it into the Code node to build
`workflow/speed-to-lead.json`. Re-run `node tools/build-workflow.mjs` after editing either file.

## Want the full kit?

This is a simplified version of the speed-to-lead workflow from **Boring Automations That Pay**, a paid kit for
self-hosted n8n. The kit adds a Postgres-backed lead store with deduplication, an auto-reply with retries and
back-off, an invoice extraction workflow, a weekly KPI report, and backup/restore scripts.
[Boring Automations That Pay](https://stormcloudsystems.gumroad.com/l/whnuf?utm_source=github&utm_medium=free&utm_campaign=scs_launch_202610&utm_content=p2_free)

## License

MIT, see [LICENSE](LICENSE).
