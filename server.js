const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const { initDatabase, query } = require("./db");

const {
    authenticateToken,
    requireRole
} = require("./auth");

const authRoutes = require("./routes");

// IMPORTANT:
// Tumhari actual file ka naam forgotpassword.js hai
const forgotPasswordRoutes = require("./forgotpassword");

const customerRoutes = require("./customer");
const adminRoutes = require("./admin");
const loanRoutes = require("./losn");
const reportRoutes = require("./report");
const collectionRoutes = require("./collection");

const {
    runJobs,
    scheduleJobs
} = require("./index");

const app = express();

app.use(cors());

const port = Number(process.env.PORT || 5000);

const jwtSecret =
    process.env.JWT_SECRET ||
    "mykisht-development-secret";

const ownerId =
    process.env.OWNER_ID ||
    "owner@mykisht.com";

const ownerPassword =
    process.env.OWNER_PASSWORD ||
    "Owner@12345";

const users = [];
const loans = [];

let databaseReady = false;


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(express.static(__dirname));


// =====================================================
// AUTH ROUTES
// =====================================================

app.use(
    "/api/auth",
    authRoutes
);


// =====================================================
// FORGOT PASSWORD / OTP
// =====================================================

app.use(
    "/api/auth/forgot-password",
    forgotPasswordRoutes
);


// =====================================================
// MAIN ROUTES
// =====================================================

app.use(
    "/api/customer",
    customerRoutes
);

app.use(
    "/api/admin",
    adminRoutes
);

app.use(
    "/api/loans",
    loanRoutes
);

app.use(
    "/api/reports",
    reportRoutes
);

app.use(
    "/api/collection",
    collectionRoutes
);


// =====================================================
// TOKEN
// =====================================================

function createToken(payload) {

    return jwt.sign(
        payload,
        jwtSecret,
        {
            expiresIn: "8h"
        }
    );

}


// =====================================================
// HEALTH
// =====================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            ok: true,
            service: "mykisht-backend",
            database:
                databaseReady
                    ? "postgresql"
                    : "memory"
        });

    }
);


// =====================================================
// LEGACY USER REGISTER
// =====================================================

app.post(
    "/api/user/register",
    async (req, res) => {

        try {

            const {
                name,
                mobile,
                email,
                address,
                password
            } = req.body;


            if (
                !name ||
                !mobile ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name, mobile and password are required."
                });

            }


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


            if (
                String(password).length < 6
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Password must be at least 6 characters."
                });

            }


            if (databaseReady) {

                const existing =
                    await query(
                        `
                        SELECT id
                        FROM customers
                        WHERE mobile = $1
                        LIMIT 1
                        `,
                        [mobile]
                    );


                if (
                    existing.rows.length > 0
                ) {

                    return res.status(409).json({
                        success: false,
                        message:
                            "Mobile number is already registered."
                    });

                }


                const passwordHash =
                    await bcrypt.hash(
                        password,
                        12
                    );


                const result =
                    await query(
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
                        (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5
                        )
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


                return res.status(201).json({

                    success: true,

                    message:
                        "Account created successfully.",

                    customer:
                        result.rows[0]

                });

            }


            return res.status(503).json({

                success: false,

                message:
                    "Database is unavailable."

            });


        } catch (error) {

            console.error(
                "Register error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to create account."

            });

        }

    }
);


// =====================================================
// LEGACY USER LOGIN
// =====================================================

app.post(
    "/api/user/login",
    async (req, res) => {

        try {

            const {
                mobile,
                password
            } = req.body;


            if (
                !mobile ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Mobile and password are required."

                });

            }


            if (databaseReady) {

                const result =
                    await query(
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
                        LIMIT 1
                        `,
                        [mobile]
                    );


                if (
                    result.rows.length === 0
                ) {

                    return res.status(401).json({

                        success: false,

                        message:
                            "Invalid mobile number or password."

                    });

                }


                const customer =
                    result.rows[0];


                if (
                    customer.is_active === false
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            "Your account is inactive."

                    });

                }


                const valid =
                    await bcrypt.compare(
                        password,
                        customer.password_hash
                    );


                if (!valid) {

                    return res.status(401).json({

                        success: false,

                        message:
                            "Invalid mobile number or password."

                    });

                }


                const token =
                    createToken({

                        id:
                            customer.id,

                        role:
                            "customer",

                        name:
                            customer.full_name

                    });


                return res.json({

                    success: true,

                    message:
                        "Login successful.",

                    token,

                    user: {

                        id:
                            customer.id,

                        name:
                            customer.full_name,

                        mobile:
                            customer.mobile,

                        email:
                            customer.email,

                        role:
                            "customer"

                    }

                });

            }


            return res.status(503).json({

                success: false,

                message:
                    "Database is unavailable."

            });


        } catch (error) {

            console.error(
                "Login error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to login."

            });

        }

    }
);


// =====================================================
// LEGACY OWNER LOGIN
// =====================================================

app.post(
    "/api/owner/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;


            if (
                email === ownerId &&
                password === ownerPassword
            ) {

                const token =
                    createToken({

                        id: 1,

                        role: "admin",

                        name:
                            "MyKisht Owner"

                    });


                return res.json({

                    success: true,

                    message:
                        "Owner login successful.",

                    token,

                    user: {

                        id: 1,

                        name:
                            "MyKisht Owner",

                        email:
                            ownerId,

                        role:
                            "admin"

                    }

                });

            }


            return res.status(401).json({

                success: false,

                message:
                    "Invalid owner credentials."

            });


        } catch (error) {

            console.error(
                "Owner login error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to login owner."

            });

        }

    }
);


// =====================================================
// ADD CUSTOMER
// =====================================================

app.post(
    "/api/owner/users",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {

        try {

            const {
                name,
                mobile,
                address
            } = req.body;


            if (
                !name ||
                !mobile
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Customer name and mobile are required."

                });

            }


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


            if (!databaseReady) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Database is unavailable."

                });

            }


            const existing =
                await query(
                    `
                    SELECT id
                    FROM customers
                    WHERE mobile = $1
                    LIMIT 1
                    `,
                    [mobile]
                );


            if (
                existing.rows.length > 0
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "Customer already exists."

                });

            }


            const passwordHash =
                await bcrypt.hash(
                    String(mobile),
                    12
                );


            const result =
                await query(
                    `
                    INSERT INTO customers
                    (
                        full_name,
                        mobile,
                        address,
                        password_hash,
                        is_active
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        true
                    )
                    RETURNING
                        id,
                        full_name,
                        mobile,
                        address
                    `,
                    [
                        name,
                        mobile,
                        address || null,
                        passwordHash
                    ]
                );


            return res.status(201).json({

                success: true,

                message:
                    "Customer added successfully.",

                customer:
                    result.rows[0]

            });


        } catch (error) {

            console.error(
                "Add customer error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to add customer.",

                error:
                    error.message

            });

        }

    }
);


// =====================================================
// API 404
// =====================================================

app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({

            success: false,

            message:
                "API endpoint not found.",

            path:
                req.originalUrl

        });

    }
);


// =====================================================
// HOME PAGE
// =====================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "my kisht.html"
            )
        );

    }
);


// =====================================================
// DATABASE + START SERVER
// =====================================================

initDatabase()
    .then(
        ready => {

            databaseReady =
                Boolean(ready);


            console.log(
                databaseReady
                    ? "✅ PostgreSQL database ready."
                    : "⚠️ Database unavailable."
            );


            app.listen(
                port,
                () => {

                    console.log("");
                    console.log(
                        "======================================"
                    );

                    console.log(
                        `🚀 MyKisht running on port ${port}`
                    );

                    console.log(
                        `🌐 http://localhost:${port}`
                    );

                    console.log(
                        "🔐 Forgot Password / OTP ready"
                    );

                    console.log(
                        "======================================"
                    );

                    console.log("");


                    try {

                        if (
                            typeof runJobs ===
                            "function"
                        ) {

                            runJobs();

                        }


                        if (
                            typeof scheduleJobs ===
                            "function"
                        ) {

                            scheduleJobs();

                        }

                    } catch (jobError) {

                        console.error(
                            "Background job error:",
                            jobError.message
                        );

                    }

                }
            );

        }
    )
    .catch(
        error => {

            console.error(
                "❌ Server startup error:",
                error
            );

            process.exit(1);

        }
    );
