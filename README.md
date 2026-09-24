# Local AI Financial Bot & GST / TDS Reconciliation Hub

A 100% offline, privacy-first local financial AI automation platform and audit reconciliation system built with Node.js, Express, React, Vite, TailwindCSS, and ExcelJS.

---

## 🚀 Key Features

### 1. Inward GST Reconciliation Engine (GSTR-2B vs. Books)
- **Automatic Multi-Field Matching**: Matches Vendor GSTIN, Normalized Invoice Number, Taxable Value, CGST, SGST, IGST, and Total Tax.
- **Invoice Number Normalization**: Strips punctuation, leading zeros, separators (`/`, `-`, `_`), and casing mismatches (e.g. `INV/2024/001` matches `INV20241`).
- **Credit Note / Debit Note Handling**: Full reverse accounting classification with positive/negative tax adjustments.
- **Configurable Tolerance Filter**: Custom threshold matching (₹0 strict, ₹1 statutory rounding tolerance, ₹2, ₹5, ₹10, or custom ₹X).
- **Statutory Rate-Wise Reconciliation Matrix**: Automatic tax breakdown across all GST tax slabs (0%, 0.1%, 0.25%, 3%, 5%, 12%, 18%, 28%) with Rule 88D ITC mismatch alerts.
- **Dual Professional Excel Exports**:
  - Master Combined Audit Excel (`GST_ITC_Combined_Audit_*.xlsx`)
  - Standalone Rate-Wise Excel (`GST_ITC_Rate_Wise_Recon_*.xlsx`)

### 2. Outward GST Reconciliation Engine (GSTR-1 vs. Sales Register)
- **Multi-File Register Ingestion**: Aggregates multi-sheet or multi-file sales data with deduplication.
- **B2B & B2CS Reconciliation**: Compares declared outward liability vs books with Rule 88C variance detection.
- **Tax Variance Categorization**: Flags missing invoices, rate-slab discrepancies, and timing differences.

### 3. TDS & 26AS / AIS Reconciliation
- **TDS Credit Ledger Matching**: Verifies Deductor TAN/PAN, Section codes (194C, 194J, 194I, etc.), Gross Amount, and TDS Deducted against Form 26AS / AIS records.
- **Branch / TAN Auto-Routing**: Automatically identifies entity TANs and branches from input records.

### 4. Bank Statement Parser & Reconciliation
- **Automated Statement Parsing**: Extracts dates, narration, cheque/reference numbers, debits, credits, and closing balances from bank Excel/CSV files.
- **Rule-Based & Semantic Clearing**: Automatically reconciles ledger transactions with bank clearance dates.

### 5. TallyPrime Universal XML Sync Hub
- Direct local sync connector with TallyPrime running on localhost port 9000.
- Pulls ledgers, vouchers, and balances directly into the reconciliation engine.

### 6. Local LLM / Claude AI Integration
- Powered by local Ollama models (via Modelfile) or Claude Anthropic API for natural language financial queries, voucher structuring, and accounting insights.

---

## 📂 Project Structure

```
local-ai-excel-financial-bot/
├── client/                     # React + Vite + TailwindCSS Frontend
│   ├── public/                 # Static assets
│   ├── src/                    # UI Components, GST Recon Hub, Tabs, Modals
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── server/                     # Node.js + Express Backend
│   ├── gstReconEngine.js       # Inward/Outward GST Matching & Variance Logic
│   ├── gstExcelEngine.js       # Formatted Multi-Sheet Excel Reports
│   ├── gstIngestionEngine.js   # Multi-file parser (JSON, XLSX, CSV)
│   ├── gstNormalizer.js        # Invoice sanitization & tax calculations
│   ├── tdsReconEngine.js       # TDS vs 26AS/AIS Matching Engine
│   ├── tdsExcelEngine.js       # TDS Reconciliation Excel Generator
│   ├── bankReconEngine.js      # Bank statement parsing & ledger clearing
│   ├── tallyService.js         # Tally XML connector (port 9000)
│   ├── localLLM.js             # Local Ollama LLM interface
│   ├── excelEngine.js          # ExcelJS core document generator
│   └── index.js                # Express API routes and server bootstrap
├── sample_gstr1.json           # Sample GSTR-1 test payload
├── sample_gstr2b.json          # Sample GSTR-2B test payload
├── sample_purchase_register.xlsx # Sample purchase register Excel
├── sample_sales_register.csv   # Sample sales register CSV
├── package.json                # Root package configuration
├── .gitignore                  # Git exclusions (node_modules, builds, temp)
└── README.md                   # Documentation
```

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher
- *(Optional)* [Ollama](https://ollama.ai/) for local offline LLM features
- *(Optional)* TallyPrime with ODBC / XML enabled on port 9000

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/local-ai-excel-financial-bot.git
   cd local-ai-excel-financial-bot
   ```

2. **Install root dependencies**:
   ```bash
   npm install
   ```

3. **Install client dependencies**:
   ```bash
   cd client
   npm install
   cd ..
   ```

---

## 💻 Running the Application

To run both the backend server and frontend client concurrently:

```bash
npm run dev
```

- **Backend API**: `http://localhost:3001` (bound to `0.0.0.0:3001`)
- **Frontend App**: `http://localhost:5173` (bound to `0.0.0.0:5173`)

Alternatively, you can run them individually in separate terminals:
- **Server only**: `npm run server`
- **Client only**: `npm run client`

---

## 🔒 Privacy & Security
- **100% Offline Processing**: All reconciliation math, string normalization, and Excel report generations run locally inside your Node environment.
- No client financial data or tax invoices are sent to external cloud servers unless explicitly configured with external LLM API keys.

---

## 📄 License
ISC License
