// Lead policy: pure functions, no I/O. Pasted verbatim into the workflow's Code node by tools/build-workflow.mjs.
// Decides whether a webhook body is an acceptable lead and builds the one notification e-mail.
// Recipient and sender come ONLY from the operator's configuration, never from the request.

// body: whole request body, measured as JSON.stringify(body).length (characters), checked before any field.
const LIMITS = { name: 100, email: 254, message: 2000, body: 16384 };
// Single plain address, no display name, no list separators, no whitespace or control characters.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
// C0, DEL, C1 (incl. U+0085 NEL) and the Unicode line/paragraph separators U+2028/U+2029.
const CTRL_ANY = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const CTRL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

function validEmail(s) {
  return typeof s === 'string' && s.length <= LIMITS.email && EMAIL_RE.test(s);
}

function evaluateLead(body, config) {
  if (!config || !validEmail(config.notify_to) || !validEmail(config.notify_from)) return { ok: false, reasons: ['config_invalid'] };
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reasons: ['body_not_object'] };
  if (JSON.stringify(body).length > LIMITS.body) return { ok: false, reasons: ['body_too_large'] };
  const reasons = [];

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) reasons.push('name_required');
  else if (name.length > LIMITS.name) reasons.push('name_too_long');
  else if (CTRL_ANY.test(name)) reasons.push('name_invalid');

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!validEmail(email)) reasons.push('email_invalid');

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) reasons.push('message_required');
  else if (message.length > LIMITS.message) reasons.push('message_too_long');
  else if (CTRL_EXCEPT_NEWLINE.test(message)) reasons.push('message_invalid');

  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    mail: {
      to: config.notify_to,
      from: config.notify_from,
      replyTo: email,
      subject: `New lead: ${name}`,
      text: `New lead from the website form.\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message.replace(/\r\n?/g, '\n')}\n`,
    },
  };
}
