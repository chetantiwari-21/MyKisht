const { query } = require("./db");


// ============================================
// UPDATE EMI STATUS
// ============================================

async function updateEMIStatus() {

    try {

        // Pending EMI ki due date nikal gayi
        await query(`
            UPDATE emi_schedule
            SET status = 'overdue'
            WHERE status = 'pending'
            AND due_date < CURRENT_DATE
        `);


        // Partial EMI ki due date nikal gayi
        await query(`
            UPDATE emi_schedule
            SET status = 'overdue'
            WHERE status = 'partial'
            AND due_date < CURRENT_DATE
        `);


        console.log(
            "✅ EMI status updated:",
            new Date().toLocaleString()
        );

    } catch (error) {

        console.error(
            "❌ EMI status update failed:",
            error.message
        );

    }

}


module.exports = {
    updateEMIStatus
};