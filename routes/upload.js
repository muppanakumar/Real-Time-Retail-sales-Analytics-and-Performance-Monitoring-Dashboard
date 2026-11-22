const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { getDb } = require('../db/database');
const { verifyToken } = require('./auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(csv|json)$/i)) return cb(new Error('Only CSV/JSON files allowed'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');
    let records;
    
    if (req.file.originalname.endsWith('.json')) {
      records = JSON.parse(fileContent);
      if (!Array.isArray(records)) records = [records];
    } else {
      records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
    }
    
    const db = getDb();
    const stores = db.prepare('SELECT id, store_code FROM stores').all();
    const storeMap = Object.fromEntries(stores.map(s => [s.store_code, s.id]));
    
    let imported = 0;
    const insertSale = db.prepare('INSERT INTO sales (store_id, date, revenue, transactions, avg_basket, units_sold, category) VALUES (?, ?, ?, ?, ?, ?, ?)');
    
    const importTx = db.transaction(() => {
      for (const row of records) {
        const storeId = storeMap[row.store_code] || storeMap[Object.keys(storeMap)[0]];
        if (!row.date || !row.revenue) continue;
        insertSale.run(
          storeId,
          row.date,
          parseFloat(row.revenue) || 0,
          parseInt(row.transactions) || 0,
          parseFloat(row.avg_basket) || parseFloat(row.revenue) / (parseInt(row.transactions) || 1),
          parseInt(row.units_sold) || 0,
          row.category || 'General'
        );
        imported++;
      }
    });
    importTx();
    
    db.prepare('INSERT INTO uploads (filename, original_name, rows_imported, uploaded_by) VALUES (?, ?, ?, ?)').run(req.file.filename, req.file.originalname, imported, req.user.id);
    
    // Broadcast update
    if (global.wsBroadcast) global.wsBroadcast('data_update', { message: 'New data uploaded', rows: imported });
    
    res.json({ success: true, filename: req.file.originalname, rows_imported: imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', verifyToken, (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT u.*, us.username FROM uploads u
    LEFT JOIN users us ON u.uploaded_by = us.id
    ORDER BY u.uploaded_at DESC LIMIT 20
  `).all();
  res.json(data);
});

module.exports = router;
