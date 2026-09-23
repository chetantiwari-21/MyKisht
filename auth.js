const jwt = require("jsonwebtoken");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const jwtSecret =
    process.env.JWT_SECRET ||
    "mykisht-development-secret";


// ============================================
// VERIFY JWT TOKEN
// ============================================

function authenticateToken(req, res, next) {

    try {

        const authHeader =
            req.headers.authorization;


        if (!authHeader) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication token is required."

            });

        }


        const parts =
            authHeader.split(" ");


        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer"
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid authorization format."

            });

        }


        const token =
            parts[1];


        const decoded =
            jwt.verify(
                token,
                jwtSecret
            );


        req.user =
            decoded;


        next();


    } catch (error) {

        console.error(
            "Authentication error:",
            error.message
        );


        return res.status(401).json({

            success: false,

            message:
                "Invalid or expired authentication token."

        });

    }

}


// ============================================
// ADMIN ONLY
// ============================================

function requireAdmin(
    req,
    res,
    next
) {

    if (!req.user) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required."

        });

    }


    // MyKisht owner/admin account
    if (
        req.user.role !== "admin" &&
        req.user.role !== "owner"
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Admin access required."

        });

    }


    next();

}


// ============================================
// CUSTOMER ONLY
// ============================================

function requireCustomer(
    req,
    res,
    next
) {

    if (!req.user) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required."

        });

    }


    if (
        req.user.role !== "customer" &&
        req.user.role !== "user"
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Customer access required."

        });

    }


    next();

}


// ============================================
// ROLE CHECK
// ============================================

function requireRole(role) {

    return (
        req,
        res,
        next
    ) => {

        if (!req.user) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }


        // Allow admin and owner to act as owner/admin
        if (
            role === "admin" &&
            (
                req.user.role === "admin" ||
                req.user.role === "owner"
            )
        ) {

            return next();

        }


        // Allow customer/user compatibility
        if (
            role === "customer" &&
            (
                req.user.role === "customer" ||
                req.user.role === "user"
            )
        ) {

            return next();

        }


        if (
            req.user.role !== role
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Access denied."

            });

        }


        next();

    };

}


// ============================================
// EXPORT
// ============================================

module.exports = {

    authenticateToken,

    requireRole,

    requireAdmin,

    requireCustomer

};