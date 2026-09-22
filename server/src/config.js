const crypto = require('crypto');
require('dotenv').config();

if (!process.env.ADMIN_PASSWORD) {
  console.error('\nADMIN_PASSWORD is not set. Copy .env.example to .env and choose a password.\n');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error('\nMONGO_URI is not set. Copy .env.example to .env and paste your MongoDB Atlas connection string.\n');
  process.exit(1);
}

module.exports = {
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: process.env.MONGO_URI,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
};
