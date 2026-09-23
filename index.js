const cron = require("node-cron");

const { updateEMIStatus } = require("./emistatus");

const {
    runReminderJobs
} = require("./remindder");


// ======================================================
// RUN JOBS ON SERVER START
// ======================================================

async function runJobs() {

    console.log("🔄 Running MyKisht background jobs...");

    await updateEMIStatus();

    await runReminderJobs();

    console.log("✅ Background jobs completed.");
}


function scheduleJobs() {
    return cron.schedule("5 0 * * *", async () => {
        console.log("Daily MyKisht job started:", new Date().toLocaleString());
        await runJobs();
    });
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {
    runJobs,
    scheduleJobs
};

if (require.main === module) {
    runJobs();
    scheduleJobs();
}