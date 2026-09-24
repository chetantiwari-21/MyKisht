const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const {
    query,
    isDatabaseReady
} = require("./db");

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


        // CHECK MOBILE

        if (!mobile) {

            return res.status(400).json({

                success: false,

                message:
                    "Mobile number is required."

            });

        }


        // CHECK 10 DIGIT MOBILE

        if (
            !/^[0-9]{10}$/.test(
                String(mobile)
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Enter a valid 10 digit mobile number."

            });

        }


        // CHECK DATABASE

        if (!isDatabaseReady()) {

            return res.status(503).json({

                success: false,

                message:
                    "Database is unavailable."

            });

        }


        // FIND CUSTOMER

        const result =
            await query(
                `
                SELECT
                    id,
                    full_name,
                    mobile

                FROM customers

                WHERE mobile = $1
                  AND is_active = true

                LIMIT 1
                `,
                [
                    mobile
                ]
            );


        if (
            result.rows.length === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "No account found with this mobile number."

            });

        }


        // =================================================
        // GENERATE 6 DIGIT OTP
        // =================================================

        const otp =
            Math.floor(
                100000 +
                Math.random() * 900000
            ).toString();


        // OTP VALID FOR 5 MINUTES

        const expiresIn =
            5 * 60;


        const expiresAt =
            Date.now() +
            (expiresIn * 1000);


        // SAVE OTP

        otpStore.set(
            String(mobile),
            {

                otp,

                expiresAt,

                attempts: 0

            }
        );


        // =================================================
        // SERVER LOG
        // =================================================

        console.log("");

        console.log(
            "================================"
        );

        console.log(
            "🔐 MYKISHT PASSWORD RESET OTP"
        );

        console.log(
            "Mobile:",
            mobile
        );

        console.log(
            "OTP:",
            otp
        );

        console.log(
            "Expires in:",
            "5 minutes"
        );

        console.log(
            "================================"
        );

        console.log("");


        // =================================================
        // DEMO RESPONSE
        // =================================================
        // This is intentionally enabled for testing.
        // For a real production SMS system, remove
        // development_otp and connect an SMS provider.
        // =================================================

        return res.json({

            success: true,

            message:
                "OTP sent successfully.",

            development_otp:
                otp,

            expires_in:
                expiresIn,

            demo:
                true

        });


    } catch (error) {

        console.error(
            "Send OTP error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to send OTP."

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


        // CHECK INPUT

        if (
            !mobile ||
            !otp
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Mobile number and OTP are required."

            });

        }


        // GET SAVED OTP

        const saved =
            otpStore.get(
                String(mobile)
            );


        if (!saved) {

            return res.status(400).json({

                success: false,

                message:
                    "OTP not found. Please request a new OTP."

            });

        }


        // =================================================
        // CHECK EXPIRY
        // =================================================

        if (
            Date.now() >
            saved.expiresAt
        ) {

            otpStore.delete(
                String(mobile)
            );


            return res.status(400).json({

                success: false,

                message:
                    "OTP has expired. Please request a new OTP."

            });

        }


        // =================================================
        // MAXIMUM ATTEMPTS
        // =================================================

        if (
            saved.attempts >= 5
        ) {

            otpStore.delete(
                String(mobile)
            );


            return res.status(400).json({

                success: false,

                message:
                    "Too many wrong attempts. Please request a new OTP."

            });

        }


        // =================================================
        // CHECK OTP
        // =================================================

        if (
            String(otp) !==
            String(saved.otp)
        ) {

            saved.attempts += 1;


            return res.status(400).json({

                success: false,

                message:
                    "Invalid OTP."

            });

        }


        // =================================================
        // OTP CORRECT
        // =================================================

        const resetToken =
            crypto
                .randomBytes(32)
                .toString("hex");


        // RESET TOKEN VALID FOR 10 MINUTES

        otpStore.set(
            String(mobile),
            {

                ...saved,

                verified:
                    true,

                resetToken,

                resetExpiresAt:
                    Date.now() +
                    (10 * 60 * 1000)

            }
        );


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

            message:
                "Unable to verify OTP."

        });

    }

});


// =====================================================
// RESET PASSWORD
// =====================================================

router.post(
    "/reset-password",
    async (req, res) => {

        try {

            const {
                mobile,
                resetToken,
                newPassword
            } = req.body;


            // =================================================
            // CHECK INPUT
            // =================================================

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


            // =================================================
            // PASSWORD LENGTH
            // =================================================

            if (
                String(newPassword).length < 6
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be at least 6 characters."

                });

            }


            // =================================================
            // GET OTP SESSION
            // =================================================

            const saved =
                otpStore.get(
                    String(mobile)
                );


            if (!saved) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password reset session expired."

                });

            }


            // =================================================
            // OTP MUST BE VERIFIED
            // =================================================

            if (
                !saved.verified
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please verify OTP first."

                });

            }


            // =================================================
            // CHECK RESET TOKEN
            // =================================================

            if (
                saved.resetToken !==
                resetToken
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid reset token."

                });

            }


            // =================================================
            // CHECK RESET TOKEN EXPIRY
            // =================================================

            if (
                Date.now() >
                saved.resetExpiresAt
            ) {

                otpStore.delete(
                    String(mobile)
                );


                return res.status(400).json({

                    success: false,

                    message:
                        "Password reset session expired."

                });

            }


            // =================================================
            // CHECK DATABASE
            // =================================================

            if (!isDatabaseReady()) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Database is unavailable."

                });

            }


            // =================================================
            // HASH NEW PASSWORD
            // =================================================

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );


            // =================================================
            // UPDATE PASSWORD
            // =================================================

            const result =
                await query(
                    `
                    UPDATE customers

                    SET
                        password_hash = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE mobile = $2
                      AND is_active = true

                    RETURNING
                        id,
                        full_name,
                        mobile
                    `,
                    [
                        passwordHash,
                        mobile
                    ]
                );


            // CUSTOMER NOT FOUND

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer account not found."

                });

            }


            // =================================================
            // DELETE OTP SESSION
            // =================================================

            otpStore.delete(
                String(mobile)
            );


            // =================================================
            // SUCCESS
            // =================================================

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

    }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;
