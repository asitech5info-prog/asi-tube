import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Import Vercel API handlers for local parity
import infoHandler from './api/info.js';
import downloadHandler from './api/download.js';
import searchHandler from './api/search.js';
import proxyHandler from './api/proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Vercel Serverless Function adapter for Express
const adaptHandler = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
};

// API Routes
app.all('/api/info', adaptHandler(infoHandler));
app.all('/api/download', adaptHandler(downloadHandler));
app.all('/api/search', adaptHandler(searchHandler));
app.all('/api/proxy', adaptHandler(proxyHandler));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`  ASI TUBE - Next-Gen Video & Audio Suite`);
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log(`  Zero-Bot-Error Anti-Bot Pipeline: ACTIVE`);
  console.log(`=========================================`);
});
