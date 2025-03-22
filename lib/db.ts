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
  const client = await pool.connect();
  try {
    // Start transaction
    await client.query('BEGIN');

    // Drop existing tables if they exist
    await client.query(`
      DROP TABLE IF EXISTS failed_qrs;
      DROP TABLE IF EXISTS successful_qrs;
    `);

    // Create tables with new schema
    await client.query(`
      CREATE TABLE failed_qrs (
        id SERIAL PRIMARY KEY,
        qr_details TEXT NOT NULL,
        error_message TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        user_name TEXT NOT NULL
      );

      CREATE TABLE successful_qrs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        user_name TEXT NOT NULL
      );
    `);

    // Commit transaction
    await client.query('COMMIT');
    console.log('Tables created successfully');
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Initialize tables
createTables().catch(console.error);

interface SuccessfulQrData {
  timestamp: Date;
  user_name: string;
}

interface FailedQrData {
  qr_details: string;
  error_message: string;
  timestamp: Date;
  user_name: string;
}

async function logFailedQr(data: FailedQrData) {
  const { qr_details, error_message, timestamp, user_name } = data;
  try {
    await pool.query(
      'INSERT INTO failed_qrs (qr_details, error_message, timestamp, user_name) VALUES ($1, $2, $3, $4)',
      [qr_details, error_message, timestamp, user_name]
    );
    console.log('Failed QR logged successfully');
  } catch (error) {
    console.error('Error logging failed QR:', error);
    throw error;
  }
}

async function logSuccessfulQr(data: SuccessfulQrData) {
  const { timestamp, user_name } = data;
  try {
    await pool.query(
      'INSERT INTO successful_qrs (timestamp, user_name) VALUES ($1, $2)',
      [timestamp, user_name]
    );
    console.log('Successful QR logged successfully');
  } catch (error) {
    console.error('Error logging successful QR:', error);
    throw error;
  }
}

export { pool, logSuccessfulQr, logFailedQr };