import fs from 'fs';
let content = fs.readFileSync('src/components/RumahSinggahModule.tsx', 'utf-8');
content = content.replace('Hubungan.P', 'Hubungan');
fs.writeFileSync('src/components/RumahSinggahModule.tsx', content);
