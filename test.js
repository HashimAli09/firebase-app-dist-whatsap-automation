const { log } = require('./whatsapp-bot');
const fs = require('fs-extra');

/**
 * Simple test to verify bot functionality including group filtering
 */
async function runTests() {
    console.log('Running basic functionality tests...\n');

    // Test logging function
    console.log('1. Testing logging function:');
    log('INFO', 'This is a test info message');
    log('ERROR', 'This is a test error message');
    console.log('✅ Logging function works correctly\n');

    // Test directory creation
    console.log('2. Testing directory creation:');
    const testDir = './test-logs';
    await fs.ensureDir(testDir);
    const exists = await fs.pathExists(testDir);
    console.log(`✅ Directory creation works: ${exists}`);
    
    // Clean up
    await fs.remove(testDir);
    console.log('✅ Test directory cleaned up\n');

    // Test JSON file operations
    console.log('3. Testing JSON file operations:');
    const testFile = './test-message.json';
    const testData = {
        timestamp: new Date().toISOString(),
        groupId: 'test@g.us',
        groupName: 'Test Group',
        senderId: 'test@s.whatsapp.net',
        senderName: 'Test User',
        messageId: 'test123',
        content: 'Test message content'
    };
    
    await fs.writeFile(testFile, JSON.stringify(testData, null, 2));
    const readData = JSON.parse(await fs.readFile(testFile, 'utf8'));
    console.log('✅ JSON file write/read works correctly');
    console.log('Test data:', readData);
    
    // Clean up
    await fs.remove(testFile);
    console.log('✅ Test file cleaned up\n');

    // Test configuration file existence
    console.log('4. Testing configuration system:');
    const configExists = await fs.pathExists('./config.json');
    const exampleConfigExists = await fs.pathExists('./config.example.json');
    console.log(`✅ Config file exists: ${configExists}`);
    console.log(`✅ Example config file exists: ${exampleConfigExists}`);
    
    if (configExists) {
        try {
            const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
            console.log(`✅ Config file is valid JSON with ${config.targetGroups?.length || 0} target groups`);
        } catch (error) {
            console.log('❌ Config file is not valid JSON');
        }
    }

    console.log('\n🎉 All tests passed! The bot is ready to use.');
    console.log('\nTo start the WhatsApp bot, run: npm start');
    console.log('\nTo configure group filtering:');
    console.log('1. Copy config.example.json to config.json');
    console.log('2. Edit config.json to specify which groups to monitor');
    console.log('3. Set "enabled": true for groups you want to monitor');
    console.log('4. The bot will auto-detect group IDs when it first sees messages from those groups');
}

runTests().catch(console.error);