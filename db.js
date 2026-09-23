const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load .env from the same folder
dotenv.config({
    path: path.join(__dirname, ".env")
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error("❌ DATABASE_URL is missing in .env");
}

const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false
    })
    : null;

let databaseReady = false;


// =====================================
// DATABASE QUERY
// =====================================

async function query(text, parameters = []) {

    if (!pool) {
        throw new Error("DATABASE_URL is not configured.");
    }

    return pool.query(text, parameters);
}


// =====================================
// INITIALIZE DATABASE
// =====================================

async function initDatabase() {

    if (!pool) {
        console.error("❌ PostgreSQL connection is not configured.");
        databaseReady = false;
        return false;
    }

    try {

        // Test PostgreSQL connection
        await pool.query("SELECT NOW()");

        console.log("✅ PostgreSQL connected successfully.");

        // Read backend.sql
        const schemaPath = path.join(__dirname, "backend.sql");

        if (!fs.existsSync(schemaPath)) {
            throw new Error("backend.sql file not found.");
        }

        const schema = fs.readFileSync(schemaPath, "utf8");

        // Run database tables/schema
        if (schema.trim()) {
            await pool.query(schema);
        }

        console.log("✅ MyKisht database tables are ready.");

        databaseReady = true;

        return true;

    } catch (error) {

        console.error("❌ PostgreSQL database error:");
        console.error(error.message);

        databaseReady = false;

        return false;
    }
}


// =====================================
// DATABASE STATUS
// =====================================

function isDatabaseReady() {
    return databaseReady;
}


// =====================================
// EXPORT
// =====================================

module.exports = {
    pool,
    query,
    initDatabase,
    isDatabaseReady
};