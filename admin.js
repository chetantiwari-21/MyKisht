const express = require("express");

const { query, isDatabaseReady } = require("./db");

const {
    authenticateToken,
    requireAdmin
} = require("./auth");

const router = express.Router();


// ======================================================
// DATABASE FALLBACK
// ======================================================

router.use((req, res, next) => {

    if (isDatabaseReady()) {
        return next();
    }


    if (req.path === "/dashboard") {

        return res.json({

            success: true,

            dashboard: {

                total_customers: 0,
                total_loans: 0,
                total_lent: 0,
                total_payable: 0,
                overdue_installments: 0

            }

        });

    }


    if (req.path === "/customers") {

        return res.json({

            success: true,

            customers: []

        });

    }


    if (
        req.path.startsWith("/customers/") &&
        req.path.endsWith("/emi")
    ) {

        return res.json({

            success: true,

            emi_schedule: []

        });

    }


    next();

});


// ======================================================
// ADMIN DASHBOARD SUMMARY
// ======================================================

router.get(
    "/dashboard",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const customers = await query(`
                SELECT COUNT(*) AS total
                FROM customers
                WHERE is_active = true
            `);


            const loans = await query(`
                SELECT
                    COUNT(*) AS total_loans,
                    COALESCE(
                        SUM(principal_amount),
                        0
                    ) AS total_lent,
                    COALESCE(
                        SUM(total_payable),
                        0
                    ) AS total_payable
                FROM loans
                WHERE status = 'active'
            `);


            const overdue = await query(`
                SELECT COUNT(*) AS total
                FROM emi_schedule e

                INNER JOIN loans l
                    ON l.id = e.loan_id

                WHERE l.status = 'active'

                AND e.status IN (
                    'overdue',
                    'missed'
                )
            `);


            const totalPayable =
                Number(
                    loans.rows[0].total_payable
                );


            res.json({

                success: true,

                dashboard: {

                    total_customers:
                        Number(
                            customers.rows[0].total
                        ),

                    total_loans:
                        Number(
                            loans.rows[0].total_loans
                        ),

                    total_lent:
                        Number(
                            loans.rows[0].total_lent
                        ),

                    total_payable:
                        totalPayable,

                    overdue_installments:
                        Number(
                            overdue.rows[0].total
                        )

                }

            });


        } catch (error) {

            console.error(
                "Admin dashboard error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load admin dashboard."

            });

        }

    }
);


// ======================================================
// ALL CUSTOMERS
// ======================================================

router.get(
    "/customers",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await query(`

                SELECT

                    c.id,

                    c.full_name,

                    c.mobile,

                    c.email,

                    c.address,

                    c.is_active,

                    c.created_at,

                    COUNT(
                        DISTINCT l.id
                    ) AS total_loans,

                    COALESCE(

                        SUM(

                            CASE

                                WHEN l.status = 'active'

                                THEN l.total_payable

                                ELSE 0

                            END

                        ),

                        0

                    ) AS total_payable

                FROM customers c

                LEFT JOIN loans l

                    ON l.customer_id = c.id

                GROUP BY c.id

                ORDER BY c.created_at DESC

            `);


            res.json({

                success: true,

                customers:
                    result.rows

            });


        } catch (error) {

            console.error(
                "Load customers error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load customers."

            });

        }

    }
);


// ======================================================
// CUSTOMER DETAILS + LOANS
// ======================================================

router.get(
    "/customers/:customerId",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const {
                customerId
            } = req.params;


            const customer =
                await query(`

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

                `, [
                    customerId
                ]);


            if (
                customer.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer not found."

                });

            }


            const loans =
                await query(`

                    SELECT

                        id,

                        customer_id,

                        principal_amount,

                        interest_rate,

                        interest_amount,

                        total_payable,

                        emi_amount,

                        total_installments,

                        frequency,

                        start_date,

                        end_date,

                        status,

                        created_at

                    FROM loans

                    WHERE customer_id = $1

                    ORDER BY created_at DESC

                `, [
                    customerId
                ]);


            res.json({

                success: true,

                customer:
                    customer.rows[0],

                loans:
                    loans.rows

            });


        } catch (error) {

            console.error(
                "Customer details error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load customer details."

            });

        }

    }
);


// ======================================================
// LOAN EMI / INSTALLMENT LIST
// ======================================================
// NEW ENDPOINT
// Used by collection.html
// ======================================================

router.get(
    "/loans/:loanId/emi",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const {
                loanId
            } = req.params;


            // ------------------------------------------
            // CHECK LOAN
            // ------------------------------------------

            const loan =
                await query(`

                    SELECT

                        id,
                        customer_id,
                        principal_amount,
                        interest_amount,
                        total_payable,
                        emi_amount,
                        total_installments,
                        frequency,
                        start_date,
                        end_date,
                        status

                    FROM loans

                    WHERE id = $1

                `, [
                    loanId
                ]);


            if (
                loan.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Loan not found."

                });

            }


            // ------------------------------------------
            // GET EMI SCHEDULE
            // ------------------------------------------

            const result =
                await query(`

                    SELECT

                        id,

                        loan_id,

                        installment_number,

                        due_date,

                        amount,

                        paid_amount,

                        status,

                        paid_at

                    FROM emi_schedule

                    WHERE loan_id = $1

                    ORDER BY
                        installment_number ASC

                `, [
                    loanId
                ]);


            const installments =
                result.rows.map(
                    emi => ({

                        ...emi,

                        amount:
                            Number(
                                emi.amount || 0
                            ),

                        paid_amount:
                            Number(
                                emi.paid_amount || 0
                            ),

                        remaining_amount:
                            Math.max(

                                Number(
                                    emi.amount || 0
                                ) -

                                Number(
                                    emi.paid_amount || 0
                                ),

                                0

                            )

                    })
                );


            res.json({

                success: true,

                loan:
                    loan.rows[0],

                emi_schedule:
                    installments

            });


        } catch (error) {

            console.error(
                "Load EMI error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load installment schedule."

            });

        }

    }
);


// ======================================================
// ADD CUSTOMER
// ======================================================

router.post(
    "/customers",
    authenticateToken,
    requireAdmin,
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


            const bcrypt =
                require("bcryptjs");


            const existing =
                await query(`

                    SELECT id

                    FROM customers

                    WHERE mobile = $1

                `, [
                    mobile
                ]);


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
                    password,
                    12
                );


            const result =
                await query(`

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
                        address,
                        created_at

                `, [

                    name,
                    mobile,
                    email || null,
                    address || null,
                    passwordHash

                ]);


            res.status(201).json({

                success: true,

                message:
                    "Customer created successfully.",

                customer:
                    result.rows[0]

            });


        } catch (error) {

            console.error(
                "Add customer error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to create customer."

            });

        }

    }
);


// ======================================================
// OVERDUE LIST
// ======================================================

router.get(
    "/overdue",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await query(`

                    SELECT

                        e.id AS emi_id,

                        e.loan_id,

                        e.installment_number,

                        e.due_date,

                        e.amount,

                        e.paid_amount,

                        (
                            e.amount -
                            e.paid_amount
                        ) AS remaining_amount,

                        c.id AS customer_id,

                        c.full_name AS customer_name,

                        c.mobile AS customer_mobile

                    FROM emi_schedule e

                    INNER JOIN loans l

                        ON l.id = e.loan_id

                    INNER JOIN customers c

                        ON c.id = l.customer_id

                    WHERE e.status IN (

                        'overdue',
                        'missed'

                    )

                    ORDER BY
                        e.due_date ASC

                `);


            res.json({

                success: true,

                total_overdue:
                    result.rows.length,

                overdue:
                    result.rows

            });


        } catch (error) {

            console.error(
                "Overdue list error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load overdue list."

            });

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;