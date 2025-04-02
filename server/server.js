const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors()); // Allow frontend requests
app.use(express.json()); // Allow JSON requests

const BASE_URL = "https://roverdata2-production.up.railway.app/api";
let session_id = "";
let currentLocation = { x: 0, y: 0 };

// Start Rover Session
async function startSession() {
    try {
        console.log("🔵 Starting rover session...");
        const response = await axios.post(`${BASE_URL}/session/start`);
        console.log("✅ Session started:", response.data);

        session_id = response.data.session_id;
        currentLocation = response.data.location || { x: 0, y: 0 };
    } catch (error) {
        console.error("❌ Failed to start session:", error.response?.data || error.message);
        session_id = ""; // Reset session ID
    }
}

// Get Rover Status
async function getRoverStatus() {
    try {
        console.log("🔍 Fetching rover status...");
        const response = await axios.get(`${BASE_URL}/rover/status?session_id=${session_id}`);

        if (!response.data || typeof response.data !== "object") {
            console.error("❌ Invalid API response.");
            return { battery: "N/A", location: "Unknown", sensor_data: "No Data", status: "Unknown" };
        }

        let battery = response.data.battery ?? "N/A";
        let location = response.data.coordinates ?? "Unknown";
        let sensor_data = response.data.sensor_data ?? "No Data";
        let status = response.data.status ?? "Unknown";

        let rechargeMessage = '';
        let communicationMessage = '';

        if (battery !== "N/A" && battery < 10) {
            communicationMessage = 'Communication lost! Recharge required.';
        } else if (battery !== "N/A" && battery <= 5) {
            rechargeMessage = 'Battery critically low! Recharging...';
        } else if (battery !== "N/A" && battery >= 80) {
            rechargeMessage = 'Battery sufficient. Rover can move.';
        }

        return {
            battery,
            rechargeMessage,
            communicationMessage,
            location,
            sensor_data,
            status
        };
    } catch (error) {
        console.error("❌ Failed to get rover status:", error.message);
        return { battery: "N/A", location: "Unknown", sensor_data: "No Data", status: "Unknown" };
    }
}

// Move Rover with Battery Check
async function moveWithBatteryCheck(direction, res) {
    console.log(`🔵 Request received to move ${direction}`);
    let status = await getRoverStatus();

    if (status.battery === "N/A") {
        console.error("❌ No valid status available! Restarting session...");
        await startSession();
        status = await getRoverStatus();
    }

    if (status.battery > 5) {
        console.log(`✅ Battery is sufficient (${status.battery}%). Moving ${direction}...`);
        await moveRover(direction);
        await stopRover();
    } else {
        console.log(`❌ Not enough battery to move ${direction}`);
    }

    const updatedStatus = await getRoverStatus();
    console.log("📌 Updated status after move:", updatedStatus);

    res.json({ status: updatedStatus });
}

// Move Rover
async function moveRover(direction) {
    try {
        console.log(`🟠 Moving rover ${direction}...`);
        const response = await axios.post(`${BASE_URL}/rover/move?session_id=${session_id}&direction=${direction}`);
        console.log(`✅ Rover moved ${direction}:`, response.data);

        if (response.data.error === 'Invalid session ID') {
            console.error("❌ Invalid session while moving! Restarting...");
            await startSession();
            return await moveRover(direction);
        }

        if (response.data && response.data.location) {
            currentLocation = response.data.location;
        }
        return response.data;
    } catch (error) {
        console.error(`❌ Failed to move rover ${direction}:`, error.response?.data || error.message);
        return { error: "Movement failed" };
    }
}

// Stop Rover
async function stopRover() {
    try {
        console.log("🛑 Stopping rover...");
        const response = await axios.post(`${BASE_URL}/rover/stop?session_id=${session_id}`);
        console.log("✅ Rover stopped:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Failed to stop rover:", error.response?.data || error.message);
        return { error: "Stopping failed" };
    }
}

// Rover Status Route
app.get('/status', async (req, res) => {
    const status = await getRoverStatus();
    res.json({ status });
});

// Movement Routes
app.get('/move/forward', async (req, res) => {
    console.log("➡️ Move Forward Request Received");
    await moveWithBatteryCheck("forward", res);
});

app.get('/move/backward', async (req, res) => {
    console.log("⬅️ Move Backward Request Received");
    await moveWithBatteryCheck("backward", res);
});

app.get('/move/left', async (req, res) => {
    console.log("↩️ Move Left Request Received");
    await moveWithBatteryCheck("left", res);
});

app.get('/move/right', async (req, res) => {
    console.log("↪️ Move Right Request Received");
    await moveWithBatteryCheck("right", res);
});

// Start Server
app.listen(PORT, async () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    await startSession();
});

// Log Battery Status Every 5 Seconds
setInterval(async () => {
    let status = await getRoverStatus();
    console.log(`⚡ Battery Status: ${status.battery}% | 📍 Location: ${JSON.stringify(status.location)}`);
}, 5000);
