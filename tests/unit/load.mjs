// Loads src/lead-policy.js the same way n8n's Code node sees it: as plain script text.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lead-policy.js');
export function loadPolicy() {
  const src = readFileSync(POLICY_PATH, 'utf8');
  return new Function(`${src}\nreturn { evaluateLead, LIMITS };`)();
}
