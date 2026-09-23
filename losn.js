const express = require("express");
const { query, pool, isDatabaseReady } = require("./db");

const { authenticateToken, requireAdmin } = require("./auth");

const router = express.Router();


// ======================================================
// HELPER: ADD DAYS / WEEKS / MONTHS
// ======================================================

function getDueDate(startDate, frequency, installmentNumber) {

    const date = new Date(startDate);

    if (frequency === "daily") {

        date.setDate(
            date.getDate() + installmentNumber
        );

    } else if (frequency === "weekly") {

        date.setDate(
            date.getDate() + (installmentNumber * 7)
        );

    } else if (frequency === "monthly") {

        date.setMonth(
            date.getMonth() + installmentNumber
        );

    }

    return date.toISOString().split("T")[0];
}


// ======================================================
// CREATE LOAN
// ======================================================

router.post(
    "/",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        if (!isDatabaseReady()) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable. Start PostgreSQL before creating a loan."
            });
        }

        const client = await pool.connect();

        try {

            const {
                customerId,
                loanAmount,
                interestRate,
                emiAmount,
                frequency,
                startDate
            } = req.body;


            // ------------------------------------------
            // VALIDATION
            // ------------------------------------------

            if (
                !customerId ||
                !loanAmount ||
                interestRate === undefined ||
                !emiAmount ||
                !frequency ||
                !startDate
            ) {

                return res.status(400).json({
                    success: false,
                    message: "All loan details are required."
                });

            }


            const principal = Number(loanAmount);

            const rate = Number(interestRate);

            const emi = Number(emiAmount);


            if (
                principal <= 0 ||
                rate < 0 ||
                emi <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid loan amount, interest or EMI."
                });

            }


            if (
                !["daily", "weekly", "monthly"]
                .includes(frequency)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Frequency must be daily, weekly or monthly."
                });

            }


            // ------------------------------------------
            // CHECK CUSTOMER
            // ------------------------------------------

            const customer = await client.query(
                `
                SELECT id, full_name
                FROM customers
                WHERE id = $1
                AND is_active = true
                `,
                [customerId]
            );


            if (customer.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Customer not found."
                });

            }


            // ------------------------------------------
            // CALCULATE LOAN
            // ------------------------------------------

            const interestAmount =
                principal * rate / 100;

            const totalPayable =
                principal + interestAmount;


            const totalInstallments =
                Math.ceil(
                    totalPayable / emi
                );


            // ------------------------------------------
            // TRANSACTION START
            // ------------------------------------------

            await client.query("BEGIN");


            // ------------------------------------------
            // CREATE LOAN
            // ------------------------------------------

            const loanResult = await client.query(
                `
                INSERT INTO loans
                (
                    customer_id,
                    principal_amount,
                    interest_rate,
                    interest_amount,
                    total_payable,
                    emi_amount,
                    total_installments,
                    frequency,
                    start_date,
                    status
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    'active'
                )

                RETURNING *
                `,
                [
                    customerId,
                    principal,
                    rate,
                    interestAmount,
                    totalPayable,
                    emi,
                    totalInstallments,
                    frequency,
                    startDate
                ]
            );


            const loan =
                loanResult.rows[0];


            // ------------------------------------------
            // GENERATE EMI SCHEDULE
            // ------------------------------------------

            const emiRows = [];


            let remainingAmount =
                totalPayable;


            for (
                let i = 1;
                i <= totalInstallments;
                i++
            ) {

                // Last EMI can be smaller
                const currentEMI =
                    i === totalInstallments
                        ? Number(
                            remainingAmount.toFixed(2)
                        )
                        : emi;


                remainingAmount -= currentEMI;


                const dueDate =
                    getDueDate(
                        startDate,
                        frequency,
                        i - 1
                    );


                const emiResult =
                    await client.query(
                        `
                        INSERT INTO emi_schedule
                        (
                            loan_id,
                            installment_number,
                            due_date,
                            amount,
                            paid_amount,
                            status
                        )
                        VALUES
                        (
                            $1,
                            $2,
                            $3,
                            $4,
                            0,
                            'pending'
                        )

                        RETURNING *
                        `,
                        [
                            loan.id,
                            i,
                            dueDate,
                            currentEMI
                        ]
                    );


                emiRows.push(
                    emiResult.rows[0]
                );

            }


            // ------------------------------------------
            // SET END DATE
            // ------------------------------------------

            const endDate =
                emiRows.length > 0
                    ? emiRows[emiRows.length - 1].due_date
                    : startDate;


            await client.query(
                `
                UPDATE loans
                SET end_date = $1
                WHERE id = $2
                `,
                [
                    endDate,
                    loan.id
                ]
            );


            // ------------------------------------------
            // COMMIT
            // ------------------------------------------

            await client.query("COMMIT");


            // ------------------------------------------
            // RESPONSE
            // ------------------------------------------

            res.status(201).json({

                success: true,

                message:
                    "Loan created and EMI schedule generated successfully.",

                loan: {
                    id: loan.id,

                    customer_id:
                        loan.customer_id,

                    customer_name:
                        customer.rows[0].full_name,

                    principal_amount:
                        principal,

                    interest_rate:
                        rate,

                    interest_amount:
                        Number(
                            interestAmount.toFixed(2)
                        ),

                    total_payable:
                        Number(
                            totalPayable.toFixed(2)
                        ),

                    emi_amount:
                        emi,

                    total_installments:
                        totalInstallments,

                    frequency,

                    start_date:
                        startDate,

                    end_date:
                        endDate,

                    status:
                        "active"
                },

                emi_schedule:
                    emiRows

            });


        } catch (error) {

            await client.query("ROLLBACK");

            console.error(
                "Create loan error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Unable to create loan."
            });

        } finally {

            client.release();

        }

    }
);


// ======================================================
// GET ALL LOANS
// ======================================================

router.get(
    "/",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await query(
                `
                SELECT

                    l.id,

                    l.customer_id,

                    c.full_name AS customer_name,

                    c.mobile AS customer_mobile,

                    l.principal_amount,

                    l.interest_rate,

                    l.interest_amount,

                    l.total_payable,

                    l.emi_amount,

                    l.total_installments,

                    l.frequency,

                    l.start_date,

                    l.end_date,

                    l.status,

                    l.created_at

                FROM loans l

                INNER JOIN customers c
                    ON c.id = l.customer_id

                ORDER BY
                    l.created_at DESC
                `
            );


            res.json({
                success: true,
                loans: result.rows
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
// GET SINGLE LOAN
// ======================================================

router.get(
    "/:loanId",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const { loanId } = req.params;


            const loan = await query(
                `
                SELECT

                    l.*,

                    c.full_name AS customer_name,

                    c.mobile AS customer_mobile

                FROM loans l

                INNER JOIN customers c
                    ON c.id = l.customer_id

                WHERE l.id = $1
                `,
                [loanId]
            );


            if (loan.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Loan not found."
                });

            }


            const emi = await query(
                `
                SELECT *

                FROM emi_schedule

                WHERE loan_id = $1

                ORDER BY
                    installment_number ASC
                `,
                [loanId]
            );


            res.json({

                success: true,

                loan: loan.rows[0],

                emi_schedule:
                    emi.rows

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load loan."
            });

        }

    }
);


// ======================================================
// CANCEL LOAN
// ======================================================

router.patch(
    "/:loanId/cancel",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const { loanId } = req.params;


            const result = await query(
                `
                UPDATE loans

                SET status = 'cancelled'

                WHERE id = $1

                AND status = 'active'

                RETURNING id, status
                `,
                [loanId]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Active loan not found."
                });

            }


            res.json({

                success: true,

                message:
                    "Loan cancelled successfully.",

                loan:
                    result.rows[0]

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to cancel loan."
            });

        }

    }
);


module.exports = router;