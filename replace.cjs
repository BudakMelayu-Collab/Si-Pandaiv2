const fs = require('fs');
let content = fs.readFileSync('src/components/RecipientForm.tsx', 'utf-8');
content = content.replace(/\s+onInvalid(?:=\{(?:[^{}]*|\{(?:[^{}]*|\{[^{}]*\})*\})*\})?\s+onInput(?:=\{(?:[^{}]*|\{(?:[^{}]*|\{[^{}]*\})*\})*\})?/g, '');
// Let's use a simpler approach since regex with balanced braces is hard in standard JS regex
// but since the expressions contain `(e.target as HTMLSelectElement).setCustomValidity("")` without nested braces,
// we can do non-greedy match.
content = content.replace(/\s+onInvalid=\{[^}]+\}\s+onInput=\{[^}]+\}/gs, '');
fs.writeFileSync('src/components/RecipientForm.tsx', content);
