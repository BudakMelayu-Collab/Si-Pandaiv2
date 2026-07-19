const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'import SurveyTemplate from "./components/SurveyTemplate";',
  'import SurveyTemplate from "./components/SurveyTemplate";\nimport SuratPernyataanTemplate from "./components/SuratPernyataanTemplate";'
);

code = code.replace(
  'const [isShowingSurvey, setIsShowingSurvey] = useState(false);',
  'const [isShowingSurvey, setIsShowingSurvey] = useState(false);\n  const [isShowingSuratPernyataan, setIsShowingSuratPernyataan] = useState(false);'
);

code = code.replace(
  'onSurvey={(rec) => {',
  'onSuratPernyataan={(rec) => {\n                      setSelectedRecipient(rec);\n                      setIsShowingSuratPernyataan(true);\n                    }}\n                    onSurvey={(rec) => {'
);

code = code.replace(
  'onSurvey={(rec) => {',
  'onSuratPernyataan={(rec) => {\n                    setSelectedRecipient(rec);\n                    setIsShowingSuratPernyataan(true);\n                  }}\n                  onSurvey={(rec) => {'
);

code = code.replace(
  'onSurvey={(rec) => {',
  'onSuratPernyataan={(rec) => {\n                      setSelectedRecipient(rec);\n                      setIsShowingSuratPernyataan(true);\n                    }}\n                    onSurvey={(rec) => {'
);

code = code.replace(
  'onSurvey={(rec) => {',
  'onSuratPernyataan={(rec) => {\n              setSelectedRecipient(rec);\n              setIsShowingSuratPernyataan(true);\n            }}\n            onSurvey={(rec) => {'
);

const templateInsert = `
      <AnimatePresence>
        {isShowingSuratPernyataan && selectedRecipient && (
          <SuratPernyataanTemplate
            recipient={selectedRecipient}
            onClose={() => setIsShowingSuratPernyataan(false)}
          />
        )}
      </AnimatePresence>
`;
code = code.replace(
  '</AnimatePresence>\n\n      <AnimatePresence>\n        {isShowingSurvey && selectedRecipient && (',
  '</AnimatePresence>\n' + templateInsert + '\n      <AnimatePresence>\n        {isShowingSurvey && selectedRecipient && ('
);

fs.writeFileSync('src/App.tsx', code);
