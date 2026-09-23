const express = require("express");

const { query, isDatabaseReady } = require("./db");

const { authenticateToken, requireCustomer } = require("./auth");

const router = express.Router();

router.use((req, res, next) => {
    if (isDatabaseReady()) {
        return next();
    }

    if (req.path === "/profile") {
        return res.json({ success: true, customer: null });
    }
    if (req.path === "/loans") {
        return res.json({ success: true, loans: [] });
    }
    if (req.path === "/outstanding") {
        return res.json({ success: true, total_payable: 0, total_outstanding: 0 });
    }
    if (req.path === "/payments") {
        return res.json({ success: true, payments: [] });
    }
    if (req.path === "/next-emi") {
        return res.json({ success: true, next_emi: null });
    }
    if (req.path === "/overdue") {
        return res.json({ success: true, overdue_installments: [] });
    }

    next();
});


// ======================================================
// CUSTOMER PROFILE
// ======================================================

router.get(
    "/profile",
    authenticateToken,
    requireCustomer,
    async (req, res) => {

        try {

            const result = await query(
                `
                SELECT
                    id,
                    full_name,
                    mobile,
                    email,
                    address,
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

            res.json({
                success: true,
                customer: result.rows[0]
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load customer profile."
            });

        }

    }
);


// ======================================================
// CUSTOMER LOANS
// ======================================================

router.get(
    "/loans",
    authenticateToken,
    requireCustomer,
    async (req, res) => {

        try {

            const result = await query(
                `
                SELECT
                    l.id,
                    l.principal_amount,
                    l.interest_rate,
                    l.interest_amount,
                    l.total_payable,
                    l.emi_amount,
                    l.total_installments,
                    l.frequency,
                    l.start_date,
                    l.end_date,
                    l.status

                FROM loans l

                WHERE l.customer_id = $1

                ORDER BY l.created_at DESC
                `,
                [req.user.id]
            );


            const loans = result.rows.map(loan => {

                const totalPayable =
                    Number(loan.total_payable);

                return {
                    ...loan,

                    principal_amount:
                        Number(loan.principal_amount),

                    interest_amount:
                        Number(loan.interest_amount),

                    total_payable:
                        totalPayable,

                    emi_amount:
                        Number(loan.emi_amount)
                };

            });


            res.json({
                success: true,
                loans
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load loans."
            });

        }

    }
);


// ======================================================
// CUSTOMER EMI SCHEDULE
// ======================================================

router.get(
    "/loans/:loanId/emi",
    authenticateToken,
    requireCustomer,
    async (req, res) => {

        try {

            const { loanId } = req.params;


            // Check loan belongs to customer
            const loanCheck = await query(
                `
                SELECT id
                FROM loans
                WHERE id = $1
                AND customer_id = $2
                `,
                [
                    loanId,
                    req.user.id
                ]
            );


            if (loanCheck.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Loan not found."
                });

            }


            const result = await query(
                `
                SELECT
                    id,
                    installment_number,
                    due_date,
                    amount,
                    paid_amount,
                    status,
                    paid_at
                FROM emi_schedule
                WHERE loan_id = $1
                ORDER BY installment_number ASC
                `,
                [loanId]
            );


            res.json({
                success: true,
                loan_id: Number(loanId),
                emi_schedule: result.rows
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load EMI schedule."
            });

        }

    }
);


// ======================================================
// CUSTOMER OUTSTANDING BALANCE
// ======================================================

router.get(
    "/outstanding",
    authenticateToken,
    requireCustomer,
    async (req, res) => {

        try {

            const result = await query(
                `
                SELECT
                    COALESCE(SUM(e.amount - e.paid_amount), 0) AS total_outstanding,
                    COALESCE(SUM(e.amount), 0) AS total_payable
                FROM emi_schedule e
                INNER JOIN loans l ON l.id = e.loan_id
                WHERE l.customer_id = $1
                AND l.status = 'active'
                AND e.status <> 'paid'
                `,
                [req.user.id]
            );


            const totalPayable =
                Number(result.rows[0].total_payable);

            res.json({
                success: true,

                total_payable: totalPayable,
                total_outstanding: totalPayable
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to calculate outstanding balance."
            });

        }

    }
);

router.get(
    "/payments",
    authenticateToken,
    requireCustomer,
    async (req, res) => {
        try {
            const result = await query(
                `SELECT c.id, c.amount, c.payment_method, c.note, c.paid_at,
                        c.created_at, c.loan_id, c.emi_id
                 FROM collections c
                 WHERE c.customer_id = $1
                 ORDER BY c.paid_at DESC, c.created_at DESC`,
                [req.user.id]
            );

            res.json({ success: true, payments: result.rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                success: false,
                message: "Unable to load payment history."
            });
        }
    }
);


// ======================================================
// CUSTOMER OVERDUE EMI
// ======================================================

router.get(
    "/overdue",
    authenticateToken,
    requireCustomer,
    async (req, res) => {

        try {

            const result = await query(
                `
                SELECT

                    e.id,
                    e.loan_id,
                    e.installment_number,
                    e.due_date,
                    e.amount,
                    e.paid_amount,
                    e.status,

                    (e.amount - e.paid_amount)
                    AS remaining_amount

                FROM emi_schedule e

                INNER JOIN loans l
                    ON l.id = e.loan_id

                WHERE l.customer_id = $1

                AND e.status IN (
                    'overdue',
                    'missed'
                )

                ORDER BY e.due_date ASC
                `,
                [req.user.id]
            );


            res.json({
                success: true,
                overdue_installments: result.rows
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load overdue installments."
            });

        }

    }
);


// ======================================================
// CUSTOMER NEXT EMI
// ======================================================

router.get(
    "/next-emi",
    authenticateToken,
    requireCustomer,
    async (req, res) => {

        try {

            const result = await query(
                `
                SELECT

                    e.id,
                    e.loan_id,
                    e.installment_number,
                    e.due_date,
                    e.amount,
                    e.paid_amount,
                    e.status

                FROM emi_schedule e

                INNER JOIN loans l
                    ON l.id = e.loan_id

                WHERE l.customer_id = $1

                AND e.status IN (
                    'pending',
                    'partial',
                    'overdue'
                )

                ORDER BY
                    e.due_date ASC

                LIMIT 1
                `,
                [req.user.id]
            );


            if (result.rows.length === 0) {

                return res.json({
                    success: true,
                    next_emi: null,
                    message: "No pending EMI found."
                });

            }


            res.json({
                success: true,
                next_emi: result.rows[0]
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load next EMI."
            });

        }

    }
);


module.exports = router;