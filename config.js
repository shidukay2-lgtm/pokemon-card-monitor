require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT) || 3000,

  // API Keys
  rakuten: {
    appId: process.env.RAKUTEN_APP_ID || '',
    baseUrl: 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601',
  },
  yahoo: {
    appId: process.env.YAHOO_APP_ID || '',
    baseUrl: 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  notificationEmail: process.env.NOTIFICATION_EMAIL || '',

  // Scraping defaults
  scraping: {
    requestIntervalMs: 3000,
    maxConcurrency: 2,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    timeout: 15000,
  },

  // Patrol defaults
  patrol: {
    defaultIntervalMinutes: 30,
    minIntervalMinutes: 5,
    maxIntervalMinutes: 120,
  },

  // AI Analysis
  ai: {
    cacheDurationHours: 24,
    maxCardsPerBatch: 10,
  },

  // Database
  db: {
    path: './data/pokemon-cards.db',
  },
};

module.exports = config;
