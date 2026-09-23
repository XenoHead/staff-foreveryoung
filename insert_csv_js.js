const fs = require('fs');
const path = "C:/Git/staff.foreveryoung/warehouse.html";
const content = fs.readFileSync(path, 'utf8');

const jsCode = [
'    // CSV Import Logic',
'    const csvInput = document.getElementById(\'csv-upload-input\');',
'    const csvStatus = document.getElementById(\'csv-import-status\');',
'    const csvBtn = document.getElementById(\'btn-import-csv\');',
'    let csvFileText = null;',
'',
'    csvInput.addEventListener(\'change\', (e) => {',
'      const file = e.target.files[0];',
'      if (!file) return;',
'      if (!file.name.toLowerCase().endsWith(\'.csv\')) {',
'        csvStatus.style.display = \'block\';',
'        csvStatus.style.color = \'var(--red)\';',
'        csvStatus.textContent = \'Please select a .csv file.\';',
'        e.target.value = \'\';',
'        csvFileText = null;',
'        return;',
'      }',
'      csvStatus.style.display = \'block\';',
'      csvStatus.className = \'status-msg\';',
'      csvStatus.style.color = \'#B6C0D7\';',
'      csvStatus.textContent = \'Reading file: \' + file.name + \' (\' + (file.size / 1024 / 1024).toFixed(1) + \' MB)...\';',
'      const reader = new FileReader();',
'      reader.onload = (ev) => {',
'        csvFileText = ev.target.result;',
'        csvStatus.textContent = \'File loaded: \' + file.name + \' (\' + csvFileText.split(\'\\n\').length + \' lines). Click Import to send to D1.\';',
'      };',
'      reader.onerror = () => {',
'        csvStatus.style.color = \'var(--red)\';',
'        csvStatus.textContent = \'Error reading file.\';',
'        csvFileText = null;',
'      };',
'      reader.readAsText(file);',
'    });',
'',
'    csvBtn.addEventListener(\'click\', async () => {',
'      if (!csvFileText) {',
'        csvStatus.style.display = \'block\';',
'        csvStatus.style.color = \'var(--red)\';',
'        csvStatus.textContent = \'No file loaded. Browse and select a CSV first.\';',
'        return;',
'      }',
'',
'      csvBtn.style.opacity = \'0.5\';',
'      csvBtn.disabled = true;',
'      csvStatus.style.display = \'block\';',
'      csvStatus.className = \'status-msg\';',
'      csvStatus.style.color = \'#B6C0D7\';',
'      csvStatus.textContent = \'Uploading to D1...\';',
'',
'      const apiUrl = \'/api/import-csv\';',
'',
'      try {',
'        const response = await fetch(apiUrl, {',
'          method: \'POST\',',
'          headers: { \'Content-Type\': \'application/json\' },',
'          body: JSON.stringify({ csv: csvFileText }),',
'        });',
'',
'        const data = await response.json();',
'',
'        if (response.ok && data.success) {',
'          csvStatus.className = \'status-msg success\';',
'          csvStatus.style.color = \'#2ecc71\';',
'          csvStatus.textContent = data.message;',
'        } else {',
'          csvStatus.style.color = \'var(--red)\';',
'          csvStatus.textContent = \'Import error: \' + (data.error || response.statusText || \'Unknown error\');',
'        }',
'      } catch (err) {',
'        csvStatus.style.color = \'var(--red)\';',
'        csvStatus.textContent = \'Network error: \' + err.message + \'. Is the Worker running locally?\';',
'      } finally {',
'        csvBtn.style.opacity = \'1\';',
'        csvBtn.disabled = false;',
'      }',
'    });',
''
].join('\n');

// The file ends with "  </script>\r\n</body>\r\n</html>"
// We need to insert the JS before "  </script>"
const endMarker = '  </script>';
const idx = content.lastIndexOf(endMarker);
if (idx === -1) {
  console.log('ERROR: Could not find </script>');
  console.log('Last 100 chars:', JSON.stringify(content.slice(-100)));
  process.exit(1);
}

const before = content.slice(0, idx);
const after = content.slice(idx); // includes "  </script>...\r\n</body>..."

const newContent = before + jsCode + '\n' + after;

fs.writeFileSync(path, newContent, 'utf8');
console.log(`Success! File now ${newContent.length} bytes, ${newContent.split('\\n').length} lines`);

// Verify
const newIdx = newContent.indexOf('csvBtn.addEventListener');
console.log(`csvBtn handler at char ${newIdx}`);
console.log('Context:', newContent.slice(newIdx - 50, newIdx + 80));
