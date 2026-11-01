# Draft: n8n template submission (NOT SUBMITTED)

Title: Send website form leads to your inbox with Webhook and SMTP e-mail

Description (Markdown, ~200 words):

## Who's it for
Small businesses and freelancers who want an e-mail the moment someone fills in the contact form on their
website, without a CRM or a database.

## How it works
1. A **Webhook** receives the form as JSON (`name`, `email`, `message`).
2. A **Code** node validates the lead: required fields, length limits, one plain e-mail address, and no line
   breaks in the name or address, so a visitor cannot add recipients or mail headers.
3. Valid leads go to **Send Email** (SMTP) as one plain-text message to your mailbox, with Reply-To set to the
   lead. The form gets HTTP 202.
4. Invalid leads get HTTP 400 with the reasons and no e-mail. If the SMTP send fails, the form gets 502 and the
   execution is marked as failed.

## How to set up
1. Set `notify_to` and `notify_from` in the **Settings** node.
2. Select your SMTP credential in **Send notification**.
3. Publish, then point your form at `/webhook/speed-to-lead`.

## Requirements
Self-hosted n8n 2.x with an SMTP account. Tested only on self-hosted n8n 2.43.4; n8n Cloud was not tested.

## How to customize the workflow
Edit the subject and body in the **Validate lead** Code node, or add fields to the validation.
Repeat submissions send repeat e-mails; add deduplication if you need it.
