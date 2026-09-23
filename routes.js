const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "backend.env") });

const { query } = require("./db");
const { authenticateToken } = require("./auth");

const router = express.Router();


// ============================================
// CREATE JWT TOKEN
// ============================================

function createToken(user) {

    return jwt.sign(
        {
            id: user.id,
            role: user.role,
            name: user.name
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}


// ============================================
// CUSTOMER REGISTER
// ============================================

router.post("/customer/register", async (req, res) => {

    try {

        const {
            name,
            mobile,
            email,
            address,
            password
        } = req.body;


        // Validation
        if (!name || !mobile || !password) {

            return res.status(400).json({
                success: false,
                message: "Name, mobile and password are required."
            });

        }


        if (!/^[0-9]{10}$/.test(mobile)) {

            return res.status(400).json({
                success: false,
                message: "Enter a valid 10 digit mobile number."
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                success: false,
                message: "Password must contain at least 6 characters."
            });

        }


        // Check existing customer
        const existingCustomer = await query(
            `
            SELECT id
            FROM customers
            WHERE mobile = $1
            `,
            [mobile]
        );


        if (existingCustomer.rows.length > 0) {

            return res.status(409).json({
                success: false,
                message: "Customer with this mobile number already exists."
            });

        }


        // Hash password
        const passwordHash = await bcrypt.hash(
            password,
            12
        );


        // Create customer
        const result = await query(
            `
            INSERT INTO customers
            (
                full_name,
                mobile,
                email,
                address,
                password_hash
            )
            VALUES
            ($1, $2, $3, $4, $5)
            RETURNING
                id,
                full_name,
                mobile,
                email,
                address
            `,
            [
                name,
                mobile,
                email || null,
                address || null,
                passwordHash
            ]
        );


        const customer = result.rows[0];


        res.status(201).json({

            success: true,

            message: "Customer account created successfully.",

            customer: {
                id: customer.id,
                name: customer.full_name,
                mobile: customer.mobile,
                email: customer.email,
                address: customer.address
            }

        });

    } catch (error) {

        console.error("Customer registration error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create customer account."
        });

    }

});


// ============================================
// CUSTOMER LOGIN
// ============================================

router.post("/customer/login", async (req, res) => {

    try {

        const {
            mobile,
            password
        } = req.body;


        if (!mobile || !password) {

            return res.status(400).json({
                success: false,
                message: "Mobile and password are required."
            });

        }


        // Find customer
        const result = await query(
            `
            SELECT
                id,
                full_name,
                mobile,
                email,
                password_hash,
                is_active
            FROM customers
            WHERE mobile = $1
            `,
            [mobile]
        );


        if (result.rows.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Invalid mobile number or password."
            });

        }


        const customer = result.rows[0];


        // Account status
        if (!customer.is_active) {

            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated."
            });

        }


        // Verify password
        const passwordMatch = await bcrypt.compare(
            password,
            customer.password_hash
        );


        if (!passwordMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid mobile number or password."
            });

        }


        // Create token
        const token = createToken({
            id: customer.id,
            role: "customer",
            name: customer.full_name
        });


        res.json({

            success: true,

            message: "Customer login successful.",

            token,

            user: {
                id: customer.id,
                name: customer.full_name,
                mobile: customer.mobile,
                email: customer.email,
                role: "customer"
            }

        });

    } catch (error) {

        console.error("Customer login error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to login."
        });

    }

});


// ============================================
// ADMIN LOGIN
// ============================================

router.post("/admin/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });

        }


        // Find admin
        const result = await query(
            `
            SELECT
                id,
                full_name,
                email,
                mobile,
                password_hash,
                is_active
            FROM admins
            WHERE email = $1
            `,
            [email.toLowerCase()]
        );


        if (result.rows.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });

        }


        const admin = result.rows[0];


        if (!admin.is_active) {

            return res.status(403).json({
                success: false,
                message: "Admin account is inactive."
            });

        }


        // Verify password
        const passwordMatch = await bcrypt.compare(
            password,
            admin.password_hash
        );


        if (!passwordMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });

        }


        // Create token
        const token = createToken({
            id: admin.id,
            role: "admin",
            name: admin.full_name
        });


        res.json({

            success: true,

            message: "Admin login successful.",

            token,

            user: {
                id: admin.id,
                name: admin.full_name,
                email: admin.email,
                mobile: admin.mobile,
                role: "admin"
            }

        });

    } catch (error) {

        console.error("Admin login error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to login."
        });

    }

});


// ============================================
// CURRENT USER
// ============================================

router.get("/me", authenticateToken, async (req, res) => {

    try {

        if (req.user.role === "customer") {

            const result = await query(
                `
                SELECT
                    id,
                    full_name,
                    mobile,
                    email,
                    address,
                    is_active,
                    created_at
                FROM customers
                WHERE id = $1
                `,
                [req.user.id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Customer not found."
                });

            }


            return res.json({
                success: true,
                role: "customer",
                user: result.rows[0]
            });

        }


        if (req.user.role === "admin") {

            const result = await query(
                `
                SELECT
                    id,
                    full_name,
                    email,
                    mobile,
                    is_active,
                    created_at
                FROM admins
                WHERE id = $1
                `,
                [req.user.id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Admin not found."
                });

            }


            return res.json({
                success: true,
                role: "admin",
                user: result.rows[0]
            });

        }


        return res.status(403).json({
            success: false,
            message: "Unknown account type."
        });

    } catch (error) {

        console.error("Get current user error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch account details."
        });

    }

});


module.exports = router;