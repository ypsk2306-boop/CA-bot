function parseCleanTokens(str) {
  return str.replace(/[^\d]/g, '');
}

function formatAsCleanTabularText(rawOcrText) {
  // Pre-clean OCR noise and broken numbers across lines
  let text = rawOcrText
    .replace(/\bhed:\s*/gi, '')
    .replace(/\bRe\.?\s*/gi, '')
    .replace(/\bRs\.?\s*/gi, '')
    .replace(/(\d+),\s*(\d+)/g, '$1,$2')
    .replace(/(\d+)\s*\n\s*00\b/g, '$100');

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    if (!line) continue;

    // Header preservation
    if (/particulars/i.test(line) && /\d{4}/.test(line)) {
      rows.push(line);
      continue;
    }

    const numRegex = /(?:\bRs\.?|\bINR|[₹$€£])?\s*\(?-?\d[\d,.]*\)?(?![a-zA-Z])/gi;
    const numberMatches = [];
    let match;
    while ((match = numRegex.exec(line)) !== null) {
      const val = match[0].trim();
      if (/\d/.test(val)) numberMatches.push(val);
    }

    const hasLetters = /[a-zA-Z]{3,}/.test(line);

    // Case 1: Pure label line, numbers on next line
    if (hasLetters && numberMatches.length === 0 && i + 1 < rawLines.length) {
      let nextLine = rawLines[i + 1].trim();
      const nextMatches = [];
      let m2;
      while ((m2 = numRegex.exec(nextLine)) !== null) {
        if (/\d/.test(m2[0])) nextMatches.push(m2[0].trim());
      }
      const nextHasLetters = /[a-zA-Z]{3,}/.test(nextLine);

      if (nextMatches.length > 0 && !nextHasLetters) {
        rows.push({ label: line, numbers: nextMatches });
        i++;
        continue;
      }
    }

    // Case 2: Label + 1 number, second number on next line
    if (hasLetters && numberMatches.length === 1 && i + 1 < rawLines.length) {
      let nextLine = rawLines[i + 1].trim();
      const nextMatches = [];
      let m2;
      while ((m2 = numRegex.exec(nextLine)) !== null) {
        if (/\d/.test(m2[0])) nextMatches.push(m2[0].trim());
      }
      const nextHasLetters = /[a-zA-Z]{3,}/.test(nextLine);

      if (nextMatches.length === 1 && !nextHasLetters) {
        let labelPart = line.replace(numberMatches[0], '').replace(/[-–=:]+$/, '').trim();
        rows.push({ label: labelPart, numbers: [numberMatches[0], nextMatches[0]] });
        i++;
        continue;
      }
    }

    // Case 3: Standard line
    if (hasLetters && numberMatches.length > 0) {
      let labelPart = line;
      for (const num of numberMatches) {
        labelPart = labelPart.replace(num, '');
      }
      labelPart = labelPart.replace(/[-–=:]+$/, '').trim();
      rows.push({ label: labelPart || line, numbers: numberMatches });
    } else {
      rows.push(line);
    }
  }

  return rows.map(r => {
    if (typeof r === 'string') return r;
    const labelPad = r.label.padEnd(26, ' ');
    if (r.numbers.length === 1) {
      return `${labelPad}\t${r.numbers[0].padStart(10, ' ')}`;
    } else if (r.numbers.length >= 2) {
      return `${labelPad}\t${r.numbers[0].padStart(10, ' ')}\t${r.numbers[1].padStart(10, ' ')}`;
    }
    return r.label;
  }).join('\n');
}

const inputOcr = `
Cash at Bank
3,000             6,500
Cash at Hand
200               5,000
Stock in Trade                           60,000
68,000
Sundry Debtors         10,000            25,000
Equipments                          hed:   8,000
8,000
Sundry Creditors                         15,000
10,000
Furniture              10,000     10,000
`;

console.log('FORMATTED TABULAR TEXT:');
console.log(formatAsCleanTabularText(inputOcr));
