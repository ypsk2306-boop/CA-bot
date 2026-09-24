import { extractLineItemsAccurately } from './localLLM.js';

const sampleOcrText = `
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

console.log('TESTING OCR PARSE:');
const result = extractLineItemsAccurately(sampleOcrText);
console.log('RESULT ITEMS:', JSON.stringify(result.items, null, 2));
