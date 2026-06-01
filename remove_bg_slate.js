const fs = require('fs');
const file = 'src/components/EPPDTemplate.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/bg-slate-50/g, 'bg-white');
fs.writeFileSync(file, content);
