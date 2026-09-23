const bcrypt = require("bcryptjs");
const { query, pool, initDatabase } = require("./db");

async function createAdmin() {
    try {

        const databaseReady = await initDatabase();

        if (!databaseReady || !pool) {
            throw new Error("PostgreSQL is not configured or available.");
        }

        // ===============================
        // ADMIN DETAILS
        // ===============================

        const name = "MyKisht Owner";
        const email = process.env.OWNER_ID || "owner@mykisht.com";
        const mobile = process.env.OWNER_MOBILE || "9999999999";
        const password = process.env.OWNER_PASSWORD || "Owner@12345";


        // ===============================
        // CHECK EXISTING ADMIN
        // ===============================

        const existingAdmin = await query(
            "SELECT id FROM admins WHERE email = $1",
            [email]
        );

        if (existingAdmin.rows.length > 0) {

            console.log("⚠️ Admin already exists.");

            return;
        }


        // ===============================
        // HASH PASSWORD
        // ===============================

        const passwordHash = await bcrypt.hash(password, 12);


        // ===============================
        // CREATE ADMIN
        // ===============================

        const result = await query(
            `
            INSERT INTO admins
            (
                full_name,
                email,
                mobile,
                password_hash
            )
            VALUES
            ($1, $2, $3, $4)
            RETURNING id, full_name, email, mobile
            `,
            [
                name,
                email,
                mobile,
                passwordHash
            ]
        );


        console.log("=================================");
        console.log("✅ Admin created successfully");
        console.log("=================================");

        console.log("ID:", result.rows[0].id);
        console.log("Name:", result.rows[0].full_name);
        console.log("Email:", result.rows[0].email);
        console.log("Mobile:", result.rows[0].mobile);

        console.log("---------------------------------");
        console.log("Login Email:", email);
        console.log("Login Password:", password);
        console.log("=================================");

    } catch (error) {

        console.error("❌ Admin creation failed:");
        console.error(error.message);

    } finally {

        if (pool) {
            await pool.end();
        }

    }
}


createAdmin();