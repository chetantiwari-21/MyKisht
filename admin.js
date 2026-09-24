const express = require("express");

const {
    query,
    isDatabaseReady,
    pool
} = require("./db");

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

            const result =
                await query(`

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

router.get(
    "/loans/:loanId/emi",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const {
                loanId
            } = req.params;


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
// DELETE CUSTOMER + ALL RELATED DATA
// ======================================================
//
// Deletes:
//
// Customer
// Loans
// EMI schedule
// Collections
// Payments
// Reminders
//
// NOTE:
// payment_receipts is NOT used because
// that table does not exist in the database.
// ======================================================

router.delete(
    "/customers/:customerId",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        let client = null;

        try {

            const {
                customerId
            } = req.params;


            // ==================================================
            // VALIDATE CUSTOMER ID
            // ==================================================

            if (
                !/^[0-9]+$/.test(
                    String(customerId)
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid customer ID."

                });

            }


            // ==================================================
            // DATABASE CHECK
            // ==================================================

            if (!pool) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Database is unavailable."

                });

            }


            // ==================================================
            // GET DATABASE CLIENT
            // ==================================================

            client =
                await pool.connect();


            // ==================================================
            // START TRANSACTION
            // ==================================================

            await client.query(
                "BEGIN"
            );


            // ==================================================
            // CHECK CUSTOMER
            // ==================================================

            const customer =
                await client.query(`

                    SELECT

                        id,

                        full_name,

                        mobile

                    FROM customers

                    WHERE id = $1

                    FOR UPDATE

                `, [
                    customerId
                ]);


            if (
                customer.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );


                return res.status(404).json({

                    success: false,

                    message:
                        "Customer not found."

                });

            }


            // ==================================================
            // GET ALL CUSTOMER LOANS
            // ==================================================

            const loans =
                await client.query(`

                    SELECT id

                    FROM loans

                    WHERE customer_id = $1

                `, [
                    customerId
                ]);


            const loanIds =
                loans.rows.map(
                    loan => loan.id
                );


            // ==================================================
            // DELETE EMI SCHEDULE
            // ==================================================

            if (
                loanIds.length > 0
            ) {

                await client.query(`

                    DELETE FROM emi_schedule

                    WHERE loan_id = ANY($1::int[])

                `, [
                    loanIds
                ]);

            }


            // ==================================================
            // DELETE COLLECTIONS
            // ==================================================

            if (
                loanIds.length > 0
            ) {

                await client.query(`

                    DELETE FROM collections

                    WHERE loan_id = ANY($1::int[])

                `, [
                    loanIds
                ]);

            }


            // ==================================================
            // DELETE PAYMENTS
            // ==================================================

            if (
                loanIds.length > 0
            ) {

                await client.query(`

                    DELETE FROM payments

                    WHERE loan_id = ANY($1::int[])

                `, [
                    loanIds
                ]);

            }


            // ==================================================
            // DELETE REMINDERS
            // ==================================================

            await client.query(`

                DELETE FROM reminders

                WHERE customer_id = $1

            `, [
                customerId
            ]);


            // ==================================================
            // DELETE LOANS
            // ==================================================

            await client.query(`

                DELETE FROM loans

                WHERE customer_id = $1

            `, [
                customerId
            ]);


            // ==================================================
            // DELETE CUSTOMER
            // ==================================================

            await client.query(`

                DELETE FROM customers

                WHERE id = $1

            `, [
                customerId
            ]);


            // ==================================================
            // COMMIT
            // ==================================================

            await client.query(
                "COMMIT"
            );


            // ==================================================
            // SUCCESS RESPONSE
            // ==================================================

            return res.json({

                success: true,

                message:
                    "Customer and all related data deleted successfully.",

                deleted_customer: {

                    id:
                        customer.rows[0].id,

                    name:
                        customer.rows[0].full_name,

                    mobile:
                        customer.rows[0].mobile

                }

            });


        } catch (error) {

            // ==================================================
            // ROLLBACK
            // ==================================================

            if (client) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

                } catch (rollbackError) {

                    console.error(
                        "Rollback error:",
                        rollbackError
                    );

                }

            }


            // ==================================================
            // ERROR LOG
            // ==================================================

            console.error(
                "Delete customer error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete customer. No data was deleted.",

                error:
                    error.message

            });


        } finally {

            // ==================================================
            // RELEASE CONNECTION
            // ==================================================

            if (client) {

                client.release();

            }

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;
// EXPORT
// ======================================================

module.exports = router;
