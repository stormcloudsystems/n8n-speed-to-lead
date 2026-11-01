# Setup checklist (one page)

Tested on self-hosted n8n 2.43.4. Steps use the n8n editor; menu names may differ slightly in other versions.

## 1. Import
- [ ] In n8n: **Workflows → Create → Import from File…** and choose `workflow/speed-to-lead.json`
      (or paste its contents into an empty workflow canvas).

## 2. Configure
- [ ] Open the **Settings** node. Set `notify_to` (the mailbox that receives new leads) and `notify_from` (the
      sender address your SMTP server allows). Both must be plain addresses like `leads@example.com`.
- [ ] Open **Send notification** → **Credential to connect with** → create or select an SMTP credential with your
      provider's host, port, user, password and TLS setting. The value stays inside n8n's encrypted credential
      store; never paste it into the workflow or a sticky note.

## 3. Publish
- [ ] Save, then publish / activate the workflow. The production URL is
      `https://<your-n8n-host>/webhook/speed-to-lead` (shown in the **Lead webhook** node).

## 4. Test with your own address
- [ ] Temporarily set `notify_to` to an address you can check, then send:
  ```sh
  curl -i -X POST https://<your-n8n-host>/webhook/speed-to-lead \
    -H 'content-type: application/json' --data @sample-lead.json
  ```
  Expect `HTTP 202` and `{"status":"accepted"}`, then one e-mail "New lead: Sam Example" (check spam too).
- [ ] Invalid lead: `--data '{"name":"","email":"nope"}'` → expect `HTTP 400` with
      `"reasons":["name_required","email_invalid","message_required"]` and no e-mail.
- [ ] Set `notify_to` back to the real mailbox.

## 5. Connect your form
- [ ] Make your website form send `POST` JSON with `name`, `email`, `message` to the production URL.
      HTML form posts (`application/x-www-form-urlencoded`) are not tested; send JSON.
- [ ] Decide whether you need protection against abuse of the public URL (see README, Limitations).
