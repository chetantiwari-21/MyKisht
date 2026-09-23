const express = require("express");

const { query } = require("./db");

const { authenticateToken, requireAdmin } = require("./auth");

const router = express.Router();


// ======================================================
// DAILY REPORT
// ======================================================

router.get(
    "/daily",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const loanResult = await query(`
                SELECT

                    COUNT(*) AS loans_created,

                    COALESCE(
                        SUM(principal_amount),
                        0
                    ) AS total_lent

                FROM loans

                WHERE created_at::date = CURRENT_DATE
            `);


            const overdueResult = await query(`
                SELECT COUNT(*) AS overdue_count

                FROM emi_schedule

                WHERE status IN (
                    'overdue',
                    'missed'
                )
            `);


            res.json({

                success: true,

                date: new Date()
                    .toISOString()
                    .split("T")[0],

                lending: {
                    loans:
                        Number(
                            loanResult.rows[0].loans_created
                        ),

                    amount:
                        Number(
                            loanResult.rows[0].total_lent
                        )
                },

                overdue:
                    Number(
                        overdueResult.rows[0].overdue_count
                    )

            });

        } catch (error) {

            console.error(
                "❌ Daily report error:",
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to generate daily report."

            });

        }

    }
);


// ======================================================
// MONTHLY REPORT
// ======================================================

router.get(
    "/monthly",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const loanResult = await query(`
                SELECT

                    COUNT(*) AS loans_created,

                    COALESCE(
                        SUM(principal_amount),
                        0
                    ) AS total_lent

                FROM loans

                WHERE created_at >= DATE_TRUNC(
                    'month',
                    CURRENT_DATE
                )

                AND created_at <
                    DATE_TRUNC(
                        'month',
                        CURRENT_DATE
                    ) + INTERVAL '1 month'
            `);


            res.json({

                success: true,

                month:
                    new Date().toLocaleString(
                        "en-IN",
                        {
                            month: "long",
                            year: "numeric"
                        }
                    ),

                lending: {

                    loans:
                        Number(
                            loanResult.rows[0].loans_created
                        ),

                    amount:
                        Number(
                            loanResult.rows[0].total_lent
                        )

                }

            });

        } catch (error) {

            console.error(
                "❌ Monthly report error:",
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to generate monthly report."

            });

        }

    }
);


// ======================================================
// OVERALL FINANCIAL SUMMARY
// ======================================================

router.get(
    "/summary",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            // ------------------------------------------
            // TOTAL LOANS
            // ------------------------------------------

            const loanResult = await query(`
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

                WHERE status != 'cancelled'
            `);


            const totalPayable =
                Number(
                    loanResult.rows[0].total_payable
                );


            // ------------------------------------------
            // OVERDUE
            // ------------------------------------------

            const overdueResult = await query(`
                SELECT

                    COUNT(*) AS overdue_installments,

                    COALESCE(
                        SUM(
                            amount - paid_amount
                        ),
                        0
                    ) AS overdue_amount

                FROM emi_schedule

                WHERE status IN (
                    'overdue',
                    'missed'
                )
            `);


            res.json({

                success: true,

                summary: {

                    total_loans:
                        Number(
                            loanResult.rows[0].total_loans
                        ),

                    total_lent:
                        Number(
                            loanResult.rows[0].total_lent
                        ),

                    total_payable:
                        totalPayable,

                    overdue_installments:
                        Number(
                            overdueResult.rows[0]
                                .overdue_installments
                        ),

                    overdue_amount:
                        Number(
                            overdueResult.rows[0]
                                .overdue_amount
                        )

                }

            });

        } catch (error) {

            console.error(
                "❌ Summary report error:",
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to generate financial summary."

            });

        }

    }
);


// ======================================================
// CUSTOMER-WISE COLLECTION REPORT
// ======================================================

router.get(
    "/customers",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await query(`
                SELECT

                    c.id AS customer_id,

                    c.full_name,

                    c.mobile,

                    COUNT(
                        DISTINCT l.id
                    ) AS total_loans,

                    COALESCE(
                        SUM(
                            DISTINCT l.total_payable
                        ),
                        0
                    ) AS total_payable

                FROM customers c

                LEFT JOIN loans l
                    ON l.customer_id = c.id
                    AND l.status != 'cancelled'

                GROUP BY
                    c.id,
                    c.full_name,
                    c.mobile

                ORDER BY
                    c.full_name
            `);


            const customers =
                result.rows.map(customer => {

                    const payable =
                        Number(
                            customer.total_payable
                        );

                    return {

                        ...customer,

                        total_loans:
                            Number(
                                customer.total_loans
                            ),

                        total_payable:
                            payable

                    };

                });


            res.json({

                success: true,

                total:
                    customers.length,

                customers

            });

        } catch (error) {

            console.error(
                "❌ Customer report error:",
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to generate customer report."

            });

        }

    }
);


module.exports = router;