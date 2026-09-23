const express = require("express");
const { query, pool, isDatabaseReady } = require("./db");
const { authenticateToken, requireAdmin } = require("./auth");

const router = express.Router();


// ===============================
// TODAY'S TOTAL COLLECTION
// ===============================
router.get("/today", authenticateToken, requireAdmin, async (req, res) => {
    if (!isDatabaseReady()) {
        return res.json({
            success: true,
            total_collection: 0
        });
    }

    try {
        const result = await query(
            `SELECT COALESCE(SUM(amount), 0) AS total_collection
             FROM collections
             WHERE paid_at::date = CURRENT_DATE`
        );

        res.json({
            success: true,
            total_collection: Number(
                result.rows[0].total_collection
            )
        });

    } catch (error) {
        console.error("Today's collection error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load today's collection."
        });
    }
});


// ===============================
// ALL COLLECTIONS
// ===============================
router.get("/", authenticateToken, requireAdmin, async (req, res) => {
    if (!isDatabaseReady()) {
        return res.json({
            success: true,
            collections: []
        });
    }

    try {
        const result = await query(
            `SELECT
                c.id,
                c.customer_id,
                c.loan_id,
                c.emi_id,
                c.amount,
                c.payment_method,
                c.note,
                c.paid_at,
                cu.full_name AS customer_name
             FROM collections c
             INNER JOIN customers cu
                ON cu.id = c.customer_id
             ORDER BY
                c.paid_at DESC,
                c.created_at DESC`
        );

        res.json({
            success: true,
            collections: result.rows
        });

    } catch (error) {
        console.error("Load collections error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load collections."
        });
    }
});


// ===============================
// ADD COLLECTION
// ===============================
router.post("/add", authenticateToken, requireAdmin, async (req, res) => {

    if (!isDatabaseReady()) {
        return res.status(503).json({
            success: false,
            message: "Database is unavailable. Start PostgreSQL before adding a collection."
        });
    }

    const client = await pool.connect();

    try {

        const {
            customerId,
            loanId,
            emiId,
            amount,
            paymentMethod,
            note
        } = req.body;

        const customerID = Number(customerId);
        const loanID = Number(loanId);
        const emiID = Number(emiId);
        const collectionAmount = Number(amount);

        // ===============================
        // VALIDATION
        // ===============================
        if (
            !Number.isInteger(customerID) ||
            !Number.isInteger(loanID) ||
            !Number.isInteger(emiID) ||
            !Number.isFinite(collectionAmount) ||
            collectionAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Customer, loan, installment and a valid amount are required."
            });
        }


        await client.query("BEGIN");


        // ===============================
        // CHECK EMI
        // ===============================
        const emiResult = await client.query(
            `SELECT
                e.id,
                e.amount,
                e.paid_amount,
                e.status
             FROM emi_schedule e
             INNER JOIN loans l
                ON l.id = e.loan_id
             WHERE e.id = $1
               AND e.loan_id = $2
               AND l.customer_id = $3
             FOR UPDATE`,
            [
                emiID,
                loanID,
                customerID
            ]
        );


        if (emiResult.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Installment not found for this customer and loan."
            });
        }


        const emi = emiResult.rows[0];

        const emiAmount = Number(emi.amount);
        const alreadyPaid = Number(emi.paid_amount || 0);

        const remaining = emiAmount - alreadyPaid;


        // ===============================
        // CHECK REMAINING
        // ===============================
        if (collectionAmount > remaining) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: `Collection amount cannot exceed remaining amount ₹${remaining}.`
            });
        }


        // ===============================
        // INSERT COLLECTION
        // ===============================
        await client.query(
            `INSERT INTO collections
            (
                customer_id,
                loan_id,
                emi_id,
                amount,
                payment_method,
                note
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6
            )`,
            [
                customerID,
                loanID,
                emiID,
                collectionAmount,
                paymentMethod || "cash",
                note || null
            ]
        );


        // ===============================
        // UPDATE EMI
        // ===============================
        const newPaidAmount =
            alreadyPaid + collectionAmount;

        const newStatus =
            newPaidAmount >= emiAmount
                ? "paid"
                : "partial";


        await client.query(
            `UPDATE emi_schedule
             SET
                paid_amount = $1,
                status = $2::varchar,
                paid_at = CASE
                    WHEN $2::varchar = 'paid'
                    THEN CURRENT_TIMESTAMP
                    ELSE paid_at
                END
             WHERE id = $3`,
            [
                newPaidAmount,
                newStatus,
                emiID
            ]
        );


        // ===============================
        // CHECK LOAN COMPLETION
        // ===============================
        const pendingResult = await client.query(
            `SELECT COUNT(*) AS pending_count
             FROM emi_schedule
             WHERE loan_id = $1
               AND status <> 'paid'`,
            [loanID]
        );


        const pendingCount =
            Number(pendingResult.rows[0].pending_count);


        if (pendingCount === 0) {

            await client.query(
                `UPDATE loans
                 SET status = 'completed'
                 WHERE id = $1`,
                [loanID]
            );
        }


        // ===============================
        // COMMIT
        // ===============================
        await client.query("COMMIT");


        res.status(201).json({
            success: true,
            message: "Collection added successfully.",
            collection: {
                customer_id: customerID,
                loan_id: loanID,
                emi_id: emiID,
                amount: collectionAmount,
                status: newStatus
            }
        });


    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Rollback error:",
                rollbackError.message
            );
        }

        console.error(
            "Add collection error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to add collection.",
            error: error.message
        });

    } finally {

        client.release();

    }
});


module.exports = router;