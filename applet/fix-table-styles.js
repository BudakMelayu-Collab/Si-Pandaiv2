const fs = require('fs');

function processFile(targetPath) {
    let content = fs.readFileSync(targetPath, 'utf8');

    // Replace all text-xs, font-medium, font-bold in table td, th, and foot with text-[11px] font-normal
    // The easiest way is regex replacements specific to the cells.
    
    // Replace outer row class names manually to avoid false positives in other components.
    content = content.replace(/text-xs\s+font-medium/g, 'text-[11px] font-normal');
    content = content.replace(/text-xs\s+font-bold/g, 'text-[11px] font-normal');
    content = content.replace(/text-\[10px\]\s+font-bold/g, 'text-[11px] font-normal');
    
    // MPZIS specifics:
    if (targetPath.includes('MPZIS')) {
        content = content.replace(
            /<td className="px-4 py-3 text-\[11px\] font-normal text-slate-600 whitespace-nowrap">\s*\{first\.purpose\}\s*<\/td>/g,
            '<td className="px-4 py-3 text-[11px] font-normal text-slate-600 max-w-[150px] whitespace-normal">\n                      <div className="line-clamp-2" title={first.purpose}>\n                        {first.purpose}\n                      </div>\n                    </td>'
        );
        content = content.replace(
            /<td className="px-4 py-2 text-\[11px\] font-normal text-slate-600">\s*\{item\.purpose \|\| first\.purpose\}\s*<\/td>/g,
            '<td className="px-4 py-2 text-[11px] font-normal text-slate-600 max-w-[150px] whitespace-normal">\n                                    <div className="line-clamp-2" title={item.purpose || first.purpose}>\n                                      {item.purpose || first.purpose}\n                                    </div>\n                                  </td>'
        );
        
        // Add whitespace-nowrap to other specific fields that just got text-[11px] but didn't have whitespace-nowrap
        content = content.replace(
            /<td className="px-4 py-3 text-\[11px\] font-normal text-slate-900">\s*\{first\.registrationId\}\s*<\/td>/g,
            '<td className="px-4 py-3 text-[11px] font-normal text-slate-900 whitespace-nowrap">\n                      {first.registrationId}\n                    </td>'
        );

        content = content.replace(
            /<td className="px-4 py-2 text-\[11px\] font-normal text-slate-800">\s*\{item\.name\}\s*<\/td>/g,
            '<td className="px-4 py-2 text-[11px] font-normal text-slate-800 whitespace-nowrap">\n                                    {item.name}\n                                  </td>'
        );
        content = content.replace(
            /<td className="px-4 py-2 text-\[11px\] font-normal text-slate-600">\s*\{item\.nik \|\| item\.kk \|\| "-\"\}\s*<\/td>/g,
            '<td className="px-4 py-2 text-[11px] font-normal text-slate-600 whitespace-nowrap">\n                                    {item.nik || item.kk || "-"}\n                                  </td>'
        );
        content = content.replace(
            /text-\[11px\] font-normal text-emerald-600 text-right"/g,
            'text-[11px] font-normal text-emerald-600 text-right whitespace-nowrap"'
        );
    }
    
    // EPPD specifics:
    if (targetPath.includes('EPPD')) {
        content = content.replace(
            /<td className="px-4 py-3 text-\[11px\] font-normal text-slate-600 whitespace-nowrap">\s*\{tujuan\}\s*<\/td>/g,
            '<td className="px-4 py-3 text-[11px] font-normal text-slate-600 max-w-[150px] whitespace-normal">\n                      <div className="line-clamp-2" title={tujuan}>\n                        {tujuan}\n                      </div>\n                    </td>'
        );
        content = content.replace(
            /<td className="px-4 py-2 text-\[11px\] font-normal text-slate-600">\s*\{item\.purpose \|\| first\.purpose\}\s*<\/td>/g,
            '<td className="px-4 py-2 text-[11px] font-normal text-slate-600 max-w-[150px] whitespace-normal">\n                                    <div className="line-clamp-2" title={item.purpose || first.purpose}>\n                                      {item.purpose || first.purpose}\n                                    </div>\n                                  </td>'
        );

        content = content.replace(
            /<td className="px-4 py-2 text-\[11px\] font-normal text-slate-800">\s*\{item\.name\}\s*<\/td>/g,
            '<td className="px-4 py-2 text-[11px] font-normal text-slate-800 whitespace-nowrap">\n                                    {item.name}\n                                  </td>'
        );
        content = content.replace(
            /<td className="px-4 py-2 text-\[11px\] font-normal text-slate-600">\s*\{item\.nik \|\| item\.kk \|\| "-\"\}\s*<\/td>/g,
            '<td className="px-4 py-2 text-[11px] font-normal text-slate-600 whitespace-nowrap">\n                                    {item.nik || item.kk || "-"}\n                                  </td>'
        );
        content = content.replace(
            /text-\[11px\] font-normal text-emerald-600 text-right"/g,
            'text-[11px] font-normal text-emerald-600 text-right whitespace-nowrap"'
        );
    }

    fs.writeFileSync(targetPath, content, 'utf8');
}

processFile('./src/components/MPZISRiwayatTable.tsx');
processFile('./src/components/EPPDRiwayatTable.tsx');
