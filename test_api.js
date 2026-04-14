import 'dotenv/config';

const NODE_API_URL = 'http://localhost:3001/api';
// Mocks what Telegram sends when the user opens the Mini App
const mockInitData = 'query_id=AAHnMgYAAAAAAOcyBgC1pU_X&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Local%22%2C%22last_name%22%3A%22Test%22%2C%22username%22%3A%22localtest%22%2C%22language_code%22%3A%22en%22%2C%22is_premium%22%3Atrue%7D&auth_date=1680000000&hash=mockhash';

async function testEndpoint(name, url, options = {}) {
    console.log(`\n--- Testing ${name} ---`);
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        console.log(`Status: ${res.status}`);
        if(res.status === 200) {
            console.log(`✅ Success`);
            // truncate output to keep logs clean
            console.log('Response:', text.substring(0, 150) + (text.length > 150 ? '...' : ''));
        } else {
            console.log(`❌ Failed - API Returned Error`);
            console.log('Response:', text);
        }
    } catch(err) {
        console.log(`❌ Failed - Exception Thrown!`);
        console.error(err);
    }
}

async function runTests() {
    console.log("Starting Extreme Investigation of Local Node.js Server...");
    
    // 1. Test Health
    await testEndpoint('Healthcheck', `${NODE_API_URL}/health`);

    // 2. Test GodOfPanel Fetch (Services)
    await testEndpoint('GET Services (GodOfPanel Check)', `${NODE_API_URL}/services`);

    // 3. Test App Settings (Database Read Check)
    await testEndpoint('GET Settings (DB Check)', `${NODE_API_URL}/app/settings`);

    // 4. Test Telegram Auth Flow & Auto User Creation
    await testEndpoint('POST Auth (DB Insert/Update Check)', `${NODE_API_URL}/app/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: mockInitData })
    });

    // 5. Test Balance Fetching
    await testEndpoint('POST Balance', `${NODE_API_URL}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: mockInitData })
    });

    console.log("\nInvestigation Complete!");
}

runTests();
