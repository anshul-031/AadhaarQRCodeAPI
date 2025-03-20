import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS failed_qrs (
        id SERIAL PRIMARY KEY,
        qr_details TEXT NOT NULL,
        error_message TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS successful_qrs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL
      );
    `);
    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

createTables();
interface SuccessfulQrData {
  timestamp: Date;
}

interface FailedQrData {
  qr_details: string;
  error_message: string;
  timestamp: Date;
}

async function logFailedQr(data: FailedQrData) {
  const { qr_details, error_message, timestamp } = data;
  try {
    await pool.query(
      'INSERT INTO failed_qrs (qr_details, error_message, timestamp) VALUES ($1, $2, $3)',
      [qr_details, error_message, timestamp]
    );
    console.log('Failed QR logged successfully');
  } catch (error) {
    console.error('Error logging failed QR:', error);
  }
}

async function logSuccessfulQr(data: SuccessfulQrData) {
  const { timestamp } = data;
  try {
    await pool.query(
      'INSERT INTO successful_qrs (timestamp) VALUES ($1)',
      [timestamp]
    );
    console.log('Successful QR logged successfully');
  } catch (error) {
    console.error('Error logging successful QR:', error);
  }
}

export { pool, logSuccessfulQr, logFailedQr };
