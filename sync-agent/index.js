require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
app.use(cors()); // Allow Warehouse UI to trigger

// Network share directory
const SHEETS_DIR = './test-sheets';
// Cloudflare API endpoint
const API_URL = process.env.API_URL || 'http://localhost:8788/api/sync';

/**
 * Reads and parses an Excel file into JSON objects
 */
function parseExcelFile(filePath) {
  try {
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    
    // IMS files lack headers, so we read as an array of rows and map manually
    if (filePath.toLowerCase().includes('ims')) {
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      return rows.map(row => ({
        UPC: row[0],
        Quantity: row[1],
        Format: row[2],
        Artist: row[3],
        Title: row[4],
        Vendor: row[5],
        OOP: row[6],
        Year: row[7],
        'Vendor Number': row[8],
        Flag: row[9],
        Modified: row[10],
        SRP: row[11]
      }));
    }

    // Default for files WITH headers
    return xlsx.utils.sheet_to_json(sheet);
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Standardizes the keys coming from different Excel sheets
 */
function standardizeData(dataRow, fileName) {
  // Extract correct UPC
  let upc = dataRow['UPC'] || dataRow['upc'] || dataRow['GLOBAL UPC'] || dataRow['UPC #'] || '';
  // Strip leading zeroes commonly added by Universal
  upc = String(upc).replace(/^0+/, '');

  // Extract correct Quantity
  let qty = dataRow['Quantity'] || dataRow['qty'] || dataRow['SHP QTY'];
  if (qty === undefined) qty = 1;

  // Extract Vendor Number
  let vendorNum = String(dataRow['Vendor Number'] || dataRow['Vendor_Number'] || '');

  // Vendor Mapping Logic based on Vendor Number (Column I)
  let vendor = dataRow['Vendor'] || dataRow['vendor'] || '';
  if (vendorNum) {
    const v = vendorNum.trim();
    if (['21', '38', '30'].includes(v)) {
      vendor = 'WebAMI';
    } else if (v === '15') {
      vendor = 'Lasgo';
    } else if (v.startsWith('50')) {
      vendor = 'UNIVERSAL MUSIC DISTRIBUTION';
    } else if (v.startsWith('3') && !['30', '38'].includes(v)) {
      vendor = 'Sony';
    } else if (['4', '40', '41', '42'].includes(v)) {
      vendor = 'Orchard';
    } else if (['27', '71', '72'].includes(v)) {
      vendor = 'RedEye';
    } else if (['60', '62', '64', '65'].includes(v)) {
      vendor = 'Warner';
    }
  }

  // Set default vendor based on filename if missing
  if (!vendor && fileName.toLowerCase().includes('stock')) {
    vendor = 'UNIVERSAL MUSIC DISTRIBUTION';
  }

  return {
    UPC: upc,
    Quantity: Number(qty),
    Format: String(dataRow['Format'] || dataRow['format'] || ''),
    Artist: String(dataRow['Artist'] || dataRow['artist'] || dataRow['ARTIST'] || ''),
    Title: String(dataRow['Title'] || dataRow['title'] || dataRow['TITLE'] || ''),
    Vendor_Number: String(dataRow['Vendor Number'] || dataRow['Vendor_Number'] || ''),
    OOP: String(dataRow['OOP'] || dataRow['oop'] || ''),
    Year: String(dataRow['Year'] || dataRow['year'] || ''),
    Vendor: vendor,
    Modified: String(dataRow['Modified'] || dataRow['modified'] || new Date().toISOString()),
    SRP: String(dataRow['SRP'] || dataRow['srp'] || '')
  };
}

/**
 * Core Sync Function
 */
async function runSyncProcess() {
  console.log(`[${new Date().toISOString()}] Starting Sync Process...`);
  
  if (!fs.existsSync(SHEETS_DIR)) {
    console.error(`Network path not found or unreachable: ${SHEETS_DIR}`);
    return { success: false, error: 'Network path unreachable' };
  }

  const files = fs.readdirSync(SHEETS_DIR);
  
  const payload = {
    sales: [],
    orders: [],
    receipts: []
  };

  const processedFiles = [];

  // Parse all relevant files
  for (const file of files) {
    const filePath = path.join(SHEETS_DIR, file);
    if (!file.endsWith('.xls') && !file.endsWith('.xlsx')) continue;

    const rawData = parseExcelFile(filePath);
    if (!rawData) continue;

    const standardizedData = rawData.map(row => standardizeData(row, file));

    const fLower = file.toLowerCase();
    if (fLower.startsWith('ims') || fLower.startsWith('sold')) {
      payload.sales.push(...standardizedData);
      processedFiles.push(filePath);
    } else if (fLower.startsWith('order_sheet') || fLower.startsWith('online_inv')) {
      payload.orders.push(...standardizedData);
      processedFiles.push(filePath);
    } else if (fLower.startsWith('stock')) {
      payload.receipts.push(...standardizedData);
      processedFiles.push(filePath);
    }
  }

  if (payload.sales.length === 0 && payload.orders.length === 0 && payload.receipts.length === 0) {
    console.log('No valid data found to sync. Aborting.');
    return { success: true, message: 'No new files' };
  }

  // Transmit to Cloudflare D1 API
  try {
    console.log(`Transmitting to ${API_URL}...`);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('Sync successful!', result.processed);
      // Clean up files ONLY if API call was successful
      for (const filePath of processedFiles) {
        fs.unlinkSync(filePath);
        console.log(`Deleted processed file: ${path.basename(filePath)}`);
      }
      return { success: true, processed: result.processed };
    } else {
      console.error('API responded with error:', result);
      return { success: false, error: result.error || 'API Error' };
    }

  } catch (err) {
    console.error('Network error communicating with Cloudflare API:', err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------
// 1. Scheduler Setup (Runs at 6:00 AM every day)
// ---------------------------------------------------------
cron.schedule('0 6 * * *', () => {
  console.log('⏰ Triggering scheduled 6:00 AM Sync');
  runSyncProcess();
});

// ---------------------------------------------------------
// 2. Local Web Server (Listens for UI clicks)
// ---------------------------------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(SHEETS_DIR)) {
      fs.mkdirSync(SHEETS_DIR, { recursive: true });
    }
    cb(null, SHEETS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    if (req.body.fileType) {
      const prefix = req.body.fileType.replace(/\s+/g, '_');
      cb(null, `${prefix}_${Date.now()}${ext}`);
    } else {
      cb(null, file.originalname);
    }
  }
});
const upload = multer({ storage: storage });

app.post('/upload-and-sync', upload.single('file'), async (req, res) => {
  console.log('⚡ Received file upload and sync trigger from UI');
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  const result = await runSyncProcess();
  if (result.success) {
    // Attempt to delete original file from network share
    const networkSharePath = '\\\\192.168.0.108\\FYRShare\\Tools\\Sheets';
    const originalFile = path.join(networkSharePath, req.file.originalname);
    try {
      if (fs.existsSync(originalFile)) {
        fs.unlinkSync(originalFile);
        console.log(`Deleted original file from share: ${originalFile}`);
      }
    } catch (err) {
      console.error(`Could not delete file from share: ${originalFile}`, err);
    }
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

app.post('/trigger-sync', async (req, res) => {
  console.log('⚡ Received manual sync trigger from UI');
  const result = await runSyncProcess();
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Automated Sync Agent running!`);
  console.log(`- Monitoring network folder: ${SHEETS_DIR}`);
  console.log(`- Scheduled sync: 6:00 AM daily`);
  console.log(`- Listening for manual triggers on port ${PORT}`);
});
