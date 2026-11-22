const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'retailpulse.db');

let db;

function getDb() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

async function initDb() {
  const fs = require('fs');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'analyst',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_code TEXT UNIQUE NOT NULL,
      store_name TEXT NOT NULL,
      region TEXT NOT NULL,
      city TEXT NOT NULL,
      manager TEXT NOT NULL,
      opened_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER,
      date TEXT NOT NULL,
      revenue REAL NOT NULL,
      transactions INTEGER NOT NULL,
      avg_basket REAL NOT NULL,
      units_sold INTEGER NOT NULL,
      category TEXT NOT NULL,
      FOREIGN KEY(store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS kpi_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      delta REAL,
      store_id INTEGER,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      rows_imported INTEGER DEFAULT 0,
      uploaded_by INTEGER,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@retailpulse.com', hash, 'admin');
    
    // Also create a demo analyst
    const demoHash = bcrypt.hashSync('Demo@123', 10);
    db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('analyst', 'analyst@retailpulse.com', demoHash, 'analyst');
    console.log('✅ Default users created: admin/Admin@123, analyst/Demo@123');
  }

  // Seed stores
  const storeCount = db.prepare('SELECT COUNT(*) as c FROM stores').get();
  if (storeCount.c === 0) {
    const stores = [
      ['STR001', 'Mumbai Central', 'West', 'Mumbai', 'Ravi Sharma', '2018-01-15'],
      ['STR002', 'Delhi North', 'North', 'Delhi', 'Priya Singh', '2019-03-20'],
      ['STR003', 'Bangalore Tech Park', 'South', 'Bangalore', 'Arun Kumar', '2020-06-10'],
      ['STR004', 'Chennai Marina', 'South', 'Chennai', 'Meena Iyer', '2017-11-05'],
      ['STR005', 'Kolkata East', 'East', 'Kolkata', 'Sourav Das', '2021-02-28'],
      ['STR006', 'Hyderabad Hub', 'South', 'Hyderabad', 'Lakshmi Reddy', '2019-08-15'],
    ];
    const insertStore = db.prepare('INSERT INTO stores (store_code, store_name, region, city, manager, opened_date) VALUES (?, ?, ?, ?, ?, ?)');
    stores.forEach(s => insertStore.run(...s));
    console.log('✅ Stores seeded');
  }

  // Seed sales data for the past 90 days
  const salesCount = db.prepare('SELECT COUNT(*) as c FROM sales').get();
  if (salesCount.c === 0) {
    seedSalesData(db);
  }

  console.log('✅ Database initialized');
}

function seedSalesData(db) {
  const stores = db.prepare('SELECT id FROM stores').all();
  const categories = ['Electronics', 'Apparel', 'Groceries', 'Home & Living', 'Sports', 'Beauty'];
  const insertSale = db.prepare('INSERT INTO sales (store_id, date, revenue, transactions, avg_basket, units_sold, category) VALUES (?, ?, ?, ?, ?, ?, ?)');
  
  const insertMany = db.transaction(() => {
    for (let day = 89; day >= 0; day--) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      const dateStr = date.toISOString().split('T')[0];
      
      stores.forEach(store => {
        categories.forEach(category => {
          const isWeekend = [0, 6].includes(date.getDay());
          const baseRevenue = Math.random() * 50000 + 20000;
          const revenue = isWeekend ? baseRevenue * 1.3 : baseRevenue;
          const transactions = Math.floor(Math.random() * 500 + 200);
          const avg_basket = revenue / transactions;
          const units_sold = Math.floor(Math.random() * 1000 + 300);
          insertSale.run(store.id, dateStr, Math.round(revenue * 100) / 100, transactions, Math.round(avg_basket * 100) / 100, units_sold, category);
        });
      });
    }
  });
  insertMany();
  console.log('✅ Sales data seeded (90 days)');
}

module.exports = { getDb, initDb };
