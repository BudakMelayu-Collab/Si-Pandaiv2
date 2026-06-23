const fs = require('fs');
let content = fs.readFileSync('src/components/RecipientForm.tsx', 'utf-8');
content = content.replace(/sub\.name\.toLowerCase\(\)/g, '(sub.name || "(Tanpa Nama)").toLowerCase()');
content = content.replace(/sub\.bankAccountHolder\.toLowerCase\(\)/g, '(sub.bankAccountHolder || "").toLowerCase()');
fs.writeFileSync('src/components/RecipientForm.tsx', content);
