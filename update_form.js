const fs = require('fs');

let code = fs.readFileSync('src/components/RecipientForm.tsx', 'utf8');

const selectProps = `required onInvalid={e => (e.target as any).setCustomValidity('Harap pilih item dalam daftar ini.')} onInput={e => (e.target as any).setCustomValidity('')}`;
const inputProps = `required onInvalid={e => (e.target as any).setCustomValidity('Harap isi bidang ini.')} onInput={e => (e.target as any).setCustomValidity('')}`;

// For all <select required ... >
code = code.replace(/<select\s+required/g, `<select REQUIRED_SELECT_MARKER`);
code = code.replace(/REQUIRED_SELECT_MARKER/g, selectProps);

// For all <input required ... > or <input ... required ... >
code = code.replace(/<input([^>]*)\srequired([^>]*)/g, `<input$1 REQUIRED_INPUT_MARKER$2`);
code = code.replace(/<input\s+required/g, `<input REQUIRED_INPUT_MARKER`);
code = code.replace(/REQUIRED_INPUT_MARKER/g, inputProps);

fs.writeFileSync('src/components/RecipientForm.tsx', code);
