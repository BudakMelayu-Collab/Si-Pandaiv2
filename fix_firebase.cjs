const fs = require('fs');
let content = fs.readFileSync('src/firebase.ts', 'utf-8');
content = content.replace(/handleFirestoreError\(error, OperationType\.DELETE, path\);\n  \}/g, 'handleFirestoreError(error, OperationType.DELETE, path);\n    throw error;\n  }');
fs.writeFileSync('src/firebase.ts', content);
