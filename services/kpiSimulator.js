const { getDb } = require('../db/database');

function startKpiSimulator() {
  console.log('📊 KPI Simulator started — broadcasting every 5s');

  setInterval(() => {
    const db = getDb();
    const metrics = [
      { metric: 'live_revenue', value: Math.round(Math.random() * 50000 + 10000), delta: (Math.random() * 10 - 5).toFixed(1) },
      { metric: 'live_transactions', value: Math.floor(Math.random() * 500 + 100), delta: (Math.random() * 8 - 4).toFixed(1) },
      { metric: 'live_basket', value: Math.round(Math.random() * 500 + 100), delta: (Math.random() * 6 - 3).toFixed(1) },
      { metric: 'live_footfall', value: Math.floor(Math.random() * 2000 + 500), delta: (Math.random() * 12 - 6).toFixed(1) },
    ];

    const insert = db.prepare('INSERT INTO kpi_snapshots (metric, value, delta) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
      metrics.forEach(m => insert.run(m.metric, m.value, parseFloat(m.delta)));
    });
    tx();

    if (global.wsBroadcast) {
      global.wsBroadcast('kpi_live', {
        metrics,
        store_highlights: generateStoreHighlights(db),
        timestamp: new Date().toISOString()
      });
    }
  }, 5000);
}

function generateStoreHighlights(db) {
  const stores = db.prepare('SELECT store_name, region FROM stores ORDER BY RANDOM() LIMIT 3').all();
  return stores.map(s => ({
    store: s.store_name,
    region: s.region,
    revenue: Math.round(Math.random() * 80000 + 20000),
    change: (Math.random() * 20 - 10).toFixed(1)
  }));
}

module.exports = { startKpiSimulator };
