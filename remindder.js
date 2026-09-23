const { query } = require("./db");


// ======================================================
// CREATE REMINDER
// ======================================================

async function createReminder(
    customerId,
    loanId,
    emiId,
    reminderType,
    message
) {

    try {

        // Check if same reminder already exists
        const existing = await query(
            `
            SELECT id
            FROM reminders

            WHERE customer_id = $1
            AND loan_id = $2
            AND emi_id = $3
            AND reminder_type = $4
            AND DATE(created_at) = CURRENT_DATE
            `,
            [
                customerId,
                loanId,
                emiId,
                reminderType
            ]
        );


        // Duplicate reminder nahi banana
        if (existing.rows.length > 0) {
            return;
        }


        await query(
            `
            INSERT INTO reminders
            (
                customer_id,
                loan_id,
                emi_id,
                reminder_type,
                channel,
                message,
                status,
                scheduled_at
            )

            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                'notification',
                $5,
                'pending',
                CURRENT_TIMESTAMP
            )
            `,
            [
                customerId,
                loanId,
                emiId,
                reminderType,
                message
            ]
        );

    } catch (error) {

        console.error(
            "❌ Reminder creation failed:",
            error.message
        );

    }
}


// ======================================================
// CHECK TOMORROW'S EMI
// ======================================================

async function createTomorrowReminders() {

    try {

        const result = await query(`
            SELECT

                e.id AS emi_id,
                e.loan_id,
                e.installment_number,
                e.amount,
                e.due_date,

                c.id AS customer_id,
                c.full_name AS customer_name

            FROM emi_schedule e

            INNER JOIN loans l
                ON l.id = e.loan_id

            INNER JOIN customers c
                ON c.id = l.customer_id

            WHERE e.due_date = CURRENT_DATE + INTERVAL '1 day'

            AND e.status = 'pending'
        `);


        for (const emi of result.rows) {

            const message =
                `Reminder: ${emi.customer_name}, ` +
                `aapki ₹${emi.amount} ki EMI ` +
                `kal due hai.`;


            await createReminder(
                emi.customer_id,
                emi.loan_id,
                emi.emi_id,
                "before_due",
                message
            );

        }


        console.log(
            `✅ Tomorrow reminders processed: ${result.rows.length}`
        );

    } catch (error) {

        console.error(
            "❌ Tomorrow reminder error:",
            error.message
        );

    }
}


// ======================================================
// CHECK TODAY'S EMI
// ======================================================

async function createTodayReminders() {

    try {

        const result = await query(`
            SELECT

                e.id AS emi_id,
                e.loan_id,
                e.installment_number,
                e.amount,
                e.due_date,

                c.id AS customer_id,
                c.full_name AS customer_name

            FROM emi_schedule e

            INNER JOIN loans l
                ON l.id = e.loan_id

            INNER JOIN customers c
                ON c.id = l.customer_id

            WHERE e.due_date = CURRENT_DATE

            AND e.status IN ('pending', 'partial')
        `);


        for (const emi of result.rows) {

            const message =
                `Aaj aapki ₹${emi.amount} ki EMI due hai. ` +
                `Kripya apni installment jama karein.`;


            await createReminder(
                emi.customer_id,
                emi.loan_id,
                emi.emi_id,
                "due_today",
                message
            );

        }


        console.log(
            `✅ Today's reminders processed: ${result.rows.length}`
        );

    } catch (error) {

        console.error(
            "❌ Today's reminder error:",
            error.message
        );

    }
}


// ======================================================
// CHECK OVERDUE EMI
// ======================================================

async function createOverdueReminders() {

    try {

        const result = await query(`
            SELECT

                e.id AS emi_id,
                e.loan_id,
                e.installment_number,
                e.amount,
                e.due_date,

                c.id AS customer_id,
                c.full_name AS customer_name

            FROM emi_schedule e

            INNER JOIN loans l
                ON l.id = e.loan_id

            INNER JOIN customers c
                ON c.id = l.customer_id

            WHERE e.status = 'overdue'
        `);


        for (const emi of result.rows) {

            const message =
                `EMI overdue: ${emi.customer_name}, ` +
                `aapki ₹${emi.amount} ki installment ` +
                `due date ke baad bhi pending hai.`;


            await createReminder(
                emi.customer_id,
                emi.loan_id,
                emi.emi_id,
                "overdue",
                message
            );

        }


        console.log(
            `⚠️ Overdue reminders processed: ${result.rows.length}`
        );

    } catch (error) {

        console.error(
            "❌ Overdue reminder error:",
            error.message
        );

    }
}


// ======================================================
// RUN ALL REMINDER CHECKS
// ======================================================

async function runReminderJobs() {

    console.log("🔔 Running reminder jobs...");

    await createTomorrowReminders();

    await createTodayReminders();

    await createOverdueReminders();

    console.log("✅ Reminder jobs completed.");

}


module.exports = {
    runReminderJobs,
    createTomorrowReminders,
    createTodayReminders,
    createOverdueReminders
};