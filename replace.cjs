const fs = require('fs');
let lines = fs.readFileSync('src/components/EPPDTemplate.tsx', 'utf8').split('\n');

function fixLine(l) {
  return l.replace(/text-(xs|sm|base)/g, 'text-[10px]').replace(/text-\[(8|9|11|12|13|14|15)px\]/g, 'text-[10px]');
}

let inFormTop = false;
let inLampiranTable = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('{/* Form Top */}')) {
    inFormTop = true;
  }
  if (lines[i].includes('{/* Lampiran Section */}')) {
    inFormTop = false;
  }
  
  if (inFormTop) {
    if (!lines[i].includes('text-[140px]')) {
      lines[i] = fixLine(lines[i]);
    }
  }
  
  if (lines[i].includes('<table className="w-full border-collapse border border-black text-[')) {
    if (i > 2000) {
      inLampiranTable = true;
    }
  }
  if (lines[i].includes('{/* Edit Signatures Modal */}')) {
    inLampiranTable = false;
  }
  
  if (inLampiranTable) {
    if (!lines[i].includes('text-lg') && !lines[i].includes('text-xl') && !lines[i].includes('text-[140px]')) {
       lines[i] = fixLine(lines[i]);
    }
  }
}

fs.writeFileSync('src/components/EPPDTemplate.tsx', lines.join('\n'));
console.log('Done');
