#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'fixtures', 'documents', 'sample.pdf');

const pageText = 'Synthetic OCR Sample';
const contentStream = `BT /F1 24 Tf 100 700 Td (${pageText}) Tj ET`;
const contentLength = Buffer.byteLength(contentStream, 'utf8');

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> >>',
  `<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
];

let output = '%PDF-1.4\n';
const offsets = [0];

for (let i = 0; i < objects.length; i++) {
  offsets.push(output.length);
  output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}

const xrefOffset = output.length;
output += 'xref\n0 6\n';
output += '0000000000 65535 f \n';

for (let i = 1; i <= objects.length; i++) {
  const offset = String(offsets[i]).padStart(10, '0');
  output += `${offset} 00000 n \n`;
}

output += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, 'utf8');

console.log(`Generated ${outputPath}`);
