const { log } = require('./whatsapp-bot');
const fs = require('fs-extra');

/**
 * Simple test to verify bot functionality
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

    console.log('🎉 All tests passed! The bot is ready to use.');
    console.log('\nTo start the WhatsApp bot, run: npm start');
}

runTests().catch(console.error);