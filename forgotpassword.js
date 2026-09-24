      //const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { query, isDatabaseReady } = require("./db");

const router = express.Router();


// =====================================================
// OTP STORE
// =====================================================

const otpStore = new Map();


// =====================================================
// SEND OTP
// =====================================================

router.post("/send-otp", async (req, res) => {

    try {

        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({
                success: false,
                message: "Mobile number is required."
            });
        }


        if (!/^[0-9]{10}$/.test(String(mobile))) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid 10 digit mobile number."
            });
        }


        if (!isDatabaseReady()) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable."
            });
        }


        const result = await query(
            `
            SELECT id, full_name, mobile
            FROM customers
            WHERE mobile = $1
              AND is_active = true
            LIMIT 1
            `,
            [mobile]
        );


        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No account found with this mobile number."
            });
        }


 Generate 6 digit OTP
        const otp =
            Math.floor(
                100000 + Math.random() * 900000
            ).toString();


        const expiresAt =
            Date.now() + (60 * 1000);


        otpStore.set(String(mobile), {
            otp,
            expiresAt,
            attempts: 0
        });


        console.log("");
        console.log("================================");
        console.log("🔐 MYKISHT PASSWORD RESET OTP");
        console.log("Mobile:", mobile);
        console.log("OTP:", otp);
        console.log("Expires in: 1 minute");
        console.log("================================");
        console.log("");


        const response = {
            success: true,
            message: "OTP sent successfully."
        };


        // Development ke liye OTP response mein bhi
        // de rahe hain. Production mein hata denge.

        if (process.env.NODE_ENV !== "production") {
            response.development_otp = otp;
        }


        return res.json(response);


    } catch (error) {

        console.error(
            "Send OTP error:",
            error
        );


        return res.status(500).json({
            success: false,
            message: "Unable to send OTP."
        });

    }

});


// =====================================================
// VERIFY OTP
// =====================================================

router.post("/verify-otp", async (req, res) => {

    try {

        const {
            mobile,
            otp
        } = req.body;


        if (!mobile || !otp) {
            return res.status(400).json({
                success: false,
                message: "Mobile number and OTP are required."
            });
        }


        const saved =
            otpStore.get(String(mobile));


        if (!saved) {
            return res.status(400).json({
                success: false,
                message: "OTP not found. Please request a new OTP."
            });
        }


        // Expired
        if (Date.now() > saved.expiresAt) {

            otpStore.delete(String(mobile));

            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new OTP."
            });

        }


        // Maximum attempts
        if (saved.attempts >= 5) {

            otpStore.delete(String(mobile));

            return res.status(400).json({
                success: false,
                message:
                    "Too many wrong attempts. Please request a new OTP."
            });

        }


        if (String(otp) !== saved.otp) {

            saved.attempts += 1;

            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });

        }


        // OTP correct
        const resetToken =
            crypto.randomBytes(32).toString("hex");


        otpStore.set(String(mobile), {
            ...saved,
            verified: true,
            resetToken,
            resetExpiresAt:
                Date.now() + (10 * 60 * 1000)
        });


        return res.json({

            success: true,

            message:
                "OTP verified successfully.",

            reset_token:
                resetToken

        });


    } catch (error) {

        console.error(
            "Verify OTP error:",
            error
        );


        return res.status(500).json({
            success: false,
            message: "Unable to verify OTP."
        });

    }

});


// =====================================================
// RESET PASSWORD
// =====================================================

router.post("/reset-password", async (req, res) => {

    try {

        const {
            mobile,
            resetToken,
            newPassword
        } = req.body;


        if (
            !mobile ||
            !resetToken ||
            !newPassword
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Mobile, reset token and new password are required."
            });

        }


        if (String(newPassword).length < 6) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 6 characters."
            });

        }


        const saved =
            otpStore.get(String(mobile));


        if (!saved) {

            return res.status(400).json({
                success: false,
                message:
                    "Password reset session expired."
            });

        }


        if (!saved.verified) {

            return res.status(400).json({
                success: false,
                message:
                    "Please verify OTP first."
            });

        }


        if (
            saved.resetToken !== resetToken
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid reset token."
            });

        }


        if (
            Date.now() > saved.resetExpiresAt
        ) {

            otpStore.delete(String(mobile));

            return res.status(400).json({
                success: false,
                message:
                    "Password reset session expired."
            });

        }


        if (!isDatabaseReady()) {

            return res.status(503).json({
                success: false,
                message:
                    "Database is unavailable."
            });

        }


        const passwordHash =
            await bcrypt.hash(
                newPassword,
                12
            );


        const result =
            await query(
                `
                UPDATE customers
                SET
                    password_hash = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE mobile = $2
                  AND is_active = true
                RETURNING id, full_name, mobile
                `,
                [
                    passwordHash,
                    mobile
                ]
            );


        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Customer account not found."
            });

        }


        // OTP session delete
        otpStore.delete(String(mobile));


        return res.json({

            success: true,

            message:
                "Password changed successfully."

        });


    } catch (error) {

        console.error(
            "Reset password error:",
            error
        );


        return res.status(500).json({
            success: false,
            message:
                "Unable to change password."
        });

    }

});


module.exports = router;  
