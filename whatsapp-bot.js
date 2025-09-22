const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const admin = require('firebase-admin');
const axios = require('axios');

// Directory to store authentication state
const AUTH_STATE_DIR = './auth-state';
const CONFIG_FILE = './config.json';

// Ensure auth state directory exists
fs.ensureDirSync(AUTH_STATE_DIR);

// Global configuration
let config = null;
let firebaseApp = null;

/**
 * Load configuration from config.json
 * @returns {object} Configuration object
 */
async function loadConfig() {
    try {
        if (await fs.pathExists(CONFIG_FILE)) {
            const configData = await fs.readFile(CONFIG_FILE, 'utf8');
            config = JSON.parse(configData);
            log('INFO', `Configuration loaded: ${config.targetGroups.length} target groups configured`);
        } else {
            // Create default config if it doesn't exist
            config = {
                targetGroups: [],
                settings: {
                    logAllGroupsIfEmpty: true,
                    caseSensitiveGroupNames: false,
                    discoveryMode: false
                },
                firebase: {
                    serviceAccountKeyPath: "./firebase-service-account-key.json",
                    projectId: "your-firebase-project-id",
                    androidAppId: "1:123456789:android:abcdef123456",
                    iosAppId: "1:123456789:ios:abcdef123456"
                }
            };
            await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
            log('INFO', 'Created default config.json - add target groups to filter messages');
        }
        return config;
    } catch (error) {
        log('ERROR', `Failed to load config: ${error.message}`);
        // Use default config on error
        config = {
            targetGroups: [],
            settings: {
                logAllGroupsIfEmpty: true,
                caseSensitiveGroupNames: false,
                discoveryMode: false
            },
            firebase: {
                serviceAccountKeyPath: "./firebase-service-account-key.json",
                projectId: "your-firebase-project-id",
                androidAppId: "1:123456789:android:abcdef123456",
                iosAppId: "1:123456789:ios:abcdef123456"
            }
        };
        return config;
    }
}

/**
 * Check if a group should be monitored based on configuration
 * @param {string} groupId - Group ID
 * @param {string} groupName - Group name
 * @returns {boolean} True if group should be monitored
 */
function shouldMonitorGroup(groupId, groupName) {
    if (!config || !config.targetGroups || config.targetGroups.length === 0) {
        return config?.settings?.logAllGroupsIfEmpty !== false;
    }

    const enabledGroups = config.targetGroups.filter(group => group.enabled !== false);
    if (enabledGroups.length === 0) {
        return config.settings.logAllGroupsIfEmpty !== false;
    }

    for (const targetGroup of enabledGroups) {
        // Check by group ID if specified
        if (targetGroup.id && targetGroup.id === groupId) {
            return true;
        }
        
        // Check by group name
        if (targetGroup.name) {
            const targetName = config.settings.caseSensitiveGroupNames 
                ? targetGroup.name 
                : targetGroup.name.toLowerCase();
            const currentName = config.settings.caseSensitiveGroupNames 
                ? groupName 
                : groupName.toLowerCase();
            
            if (targetName === currentName) {
                // Update the group ID in config for future reference
                if (!targetGroup.id) {
                    targetGroup.id = groupId;
                    saveConfigAsync();
                }
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Save configuration asynchronously without blocking
 */
async function saveConfigAsync() {
    try {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        log('ERROR', `Failed to save config: ${error.message}`);
    }
}

/**
 * Initialize Firebase Admin SDK
 */
async function initializeFirebase() {
    try {
        if (!config.firebase) {
            log('WARN', 'Firebase configuration not found in config.json');
            return false;
        }

        const { serviceAccountKeyPath, projectId } = config.firebase;
        
        if (!await fs.pathExists(serviceAccountKeyPath)) {
            log('WARN', `Firebase service account key not found at: ${serviceAccountKeyPath}`);
            return false;
        }

        const serviceAccount = require(path.resolve(serviceAccountKeyPath));
        
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: projectId
        });
        
        log('INFO', 'Firebase Admin SDK initialized successfully');
        return true;
    } catch (error) {
        log('ERROR', `Failed to initialize Firebase: ${error.message}`);
        return false;
    }
}

/**
 * Check if message matches distribution request format: [Email]-[platform]
 * @param {string} messageContent - The message content to check
 * @returns {object|null} Parsed request object or null if no match
 */
function parseDistributionRequest(messageContent) {
    const pattern = /^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})-(android|ios)$/i;
    const match = messageContent.trim().match(pattern);
    
    if (match) {
        return {
            email: match[1].toLowerCase(),
            platform: match[2].toLowerCase()
        };
    }
    
    return null;
}

/**
 * Get Firebase access token for API requests
 */
async function getFirebaseAccessToken() {
    try {
        const accessToken = await admin.credential.applicationDefault().getAccessToken();
        return accessToken.access_token;
    } catch (error) {
        // If default credentials don't work, try using the service account
        if (firebaseApp) {
            const accessToken = await firebaseApp.credential.getAccessToken();
            return accessToken.access_token;
        }
        throw error;
    }
}

/**
 * List Firebase App Distribution releases for an app
 * @param {string} projectId - Firebase project ID
 * @param {string} appId - Firebase app ID (not package name)
 * @returns {Array} Array of releases
 */
async function listAppDistributionReleases(projectId, appId) {
    try {
        const accessToken = await getFirebaseAccessToken();
        const url = `https://firebaseappdistribution.googleapis.com/v1/projects/${projectId}/apps/${appId}/releases`;
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.releases || [];
    } catch (error) {
        log('ERROR', `Failed to list releases: ${error.message}`);
        return [];
    }
}

/**
 * Add testers to a Firebase App Distribution release
 * @param {string} projectId - Firebase project ID
 * @param {string} appId - Firebase app ID
 * @param {string} releaseId - Release ID
 * @param {Array} emails - Array of email addresses
 */
async function addTestersToRelease(projectId, appId, releaseId, emails) {
    try {
        const accessToken = await getFirebaseAccessToken();
        const url = `https://firebaseappdistribution.googleapis.com/v1/projects/${projectId}/apps/${appId}/releases/${releaseId}:distribute`;
        
        const response = await axios.post(url, {
            testerEmails: emails
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        throw new Error(`Failed to add testers: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * Add tester to Firebase App Distribution
 * @param {string} email - Tester email address
 * @param {string} platform - Platform (android/ios)
 * @returns {object} Result object with success status and message
 */
async function addTesterToDistribution(email, platform) {
    try {
        if (!firebaseApp) {
            return { success: false, message: 'Firebase not initialized' };
        }

        // Get the app ID for the platform
        const appIdKey = platform === 'android' ? 'androidAppId' : 'iosAppId';
        const appId = config.firebase[appIdKey];
        
        if (!appId) {
            return { 
                success: false, 
                message: `No ${platform} app ID configured in config.json (${appIdKey})` 
            };
        }

        // List releases to find the latest one
        const releases = await listAppDistributionReleases(config.firebase.projectId, appId);
        
        if (!releases.length) {
            return { 
                success: false, 
                message: `No releases found for ${platform} app` 
            };
        }

        // Get the latest release (releases are sorted by creation time desc)
        const latestRelease = releases[0];
        const releaseId = latestRelease.name.split('/').pop();
        
        // Add tester to the latest release
        await addTestersToRelease(config.firebase.projectId, appId, releaseId, [email]);
        
        return {
            success: true,
            message: `Successfully added ${email} to ${platform} app distribution (Release: ${latestRelease.displayVersion || releaseId})`
        };

    } catch (error) {
        log('ERROR', `Failed to add tester to distribution: ${error.message}`);
        return {
            success: false,
            message: `Failed to add tester: ${error.message}`
        };
    }
}

/**
 * Send WhatsApp reply to group
 * @param {object} sock - WhatsApp socket instance  
 * @param {string} groupId - Group ID to send message to
 * @param {string} message - Message to send
 */
async function sendGroupReply(sock, groupId, message) {
    try {
        await sock.sendMessage(groupId, { text: message });
        log('INFO', `Sent reply to group ${groupId}: ${message}`);
    } catch (error) {
        log('ERROR', `Failed to send group reply: ${error.message}`);
    }
}

/**
 * Process distribution request
 * @param {object} sock - WhatsApp socket instance
 * @param {string} groupId - Group ID where request came from
 * @param {string} messageContent - Message content
 */
async function processDistributionRequest(sock, groupId, messageContent) {
    const request = parseDistributionRequest(messageContent);
    
    if (!request) {
        return; // Not a distribution request
    }

    log('INFO', `Processing distribution request: ${request.email} for ${request.platform}`);
    
    // Add tester to distribution
    const result = await addTesterToDistribution(request.email, request.platform);
    
    // Send reply to group
    const replyMessage = result.success 
        ? `✅ ${result.message}`
        : `❌ ${result.message}`;
    
    await sendGroupReply(sock, groupId, replyMessage);
}

/**
 * Format timestamp for logging
 * @param {Date} date - Date object to format
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(date = new Date()) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Log message with timestamp
 * @param {string} level - Log level (INFO, ERROR, etc.)
 * @param {string} message - Message to log
 */
function log(level, message) {
    console.log(`[${formatTimestamp()}] [${level}] ${message}`);
}

/**
 * Main function to start the WhatsApp bot
 */
async function startWhatsAppBot() {
    try {
        log('INFO', 'Starting WhatsApp Group Listener Bot...');
        
        // Load configuration
        await loadConfig();
        
        // Initialize Firebase
        await initializeFirebase();
        
        // Load authentication state
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR);
        
        // Create WhatsApp socket connection
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // We'll handle QR code display manually
            logger: {
                level: 'silent', // Reduce Baileys logging
                fatal: () => {},
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                trace: () => {},
                child: () => ({
                    level: 'silent',
                    fatal: () => {},
                    error: () => {},
                    warn: () => {},
                    info: () => {},
                    debug: () => {},
                    trace: () => {}
                })
            }
        });

        // Handle QR code for authentication
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                log('INFO', 'Please scan the QR code with your WhatsApp app:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                log('INFO', `Connection closed. Reconnecting: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    setTimeout(() => startWhatsAppBot(), 3000);
                }
            } else if (connection === 'open') {
                log('INFO', 'WhatsApp connection established successfully!');
                const enabledGroups = config.targetGroups.filter(g => g.enabled !== false);
                if (enabledGroups.length > 0) {
                    log('INFO', `Bot is now listening for messages from ${enabledGroups.length} configured group(s):`);
                    enabledGroups.forEach(group => {
                        log('INFO', `  - ${group.name}${group.id ? ` (${group.id})` : ' (ID will be auto-detected)'}`);
                    });
                } else {
                    log('INFO', 'Bot is now listening for messages from all groups (no specific groups configured)');
                }
            }
        });

        // Save authentication credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            const { messages } = messageUpdate;
            
            for (const message of messages) {
                // Skip if message is from ourselves
                if (message.key.fromMe) continue;
                
                // Check if message is from a group
                if (message.key.remoteJid && message.key.remoteJid.endsWith('@g.us')) {
                    await logGroupMessage(sock, message);
                }
            }
        });

        return sock;
    } catch (error) {
        log('ERROR', `Failed to start WhatsApp bot: ${error.message}`);
        throw error;
    }
}

/**
 * Discovery mode: Log all group IDs and names for configuration purposes
 * @param {object} sock - WhatsApp socket instance
 * @param {object} message - Message object
 */
async function discoverGroupInfo(sock, message) {
    try {
        const groupId = message.key.remoteJid;
        
        // Get group metadata for group name
        let groupName = 'Unknown Group';
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            groupName = groupMetadata.subject;
        } catch (error) {
            groupName = groupId;
        }
        
        // Log group info for discovery
        if (!global.discoveredGroups) global.discoveredGroups = new Set();
        if (!global.discoveredGroups.has(groupId)) {
            console.log('\n' + '='.repeat(80));
            log('DISCOVERY', `Found WhatsApp Group:`);
            console.log(`  Name: ${groupName}`);
            console.log(`  ID: ${groupId}`);
            console.log(`  Add to config.json under targetGroups:`);
            console.log(`  {`);
            console.log(`    "name": "${groupName}",`);
            console.log(`    "id": "${groupId}",`);
            console.log(`    "enabled": true`);
            console.log(`  }`);
            console.log('='.repeat(80) + '\n');
            global.discoveredGroups.add(groupId);
        }
    } catch (error) {
        log('ERROR', `Failed to discover group info: ${error.message}`);
    }
}

/**
 * Log group message details
 * @param {object} sock - WhatsApp socket instance
 * @param {object} message - Message object
 */
async function logGroupMessage(sock, message) {
    try {
        const groupId = message.key.remoteJid;
        const senderId = message.key.participant || message.participant;
        const messageId = message.key.id;
        const timestamp = new Date(message.messageTimestamp * 1000);
        
        // Extract message content
        let messageContent = 'Unknown message type';
        if (message.message) {
            if (message.message.conversation) {
                messageContent = message.message.conversation;
            } else if (message.message.extendedTextMessage) {
                messageContent = message.message.extendedTextMessage.text;
            } else if (message.message.imageMessage) {
                messageContent = '[Image]' + (message.message.imageMessage.caption ? `: ${message.message.imageMessage.caption}` : '');
            } else if (message.message.videoMessage) {
                messageContent = '[Video]' + (message.message.videoMessage.caption ? `: ${message.message.videoMessage.caption}` : '');
            } else if (message.message.audioMessage) {
                messageContent = '[Audio Message]';
            } else if (message.message.documentMessage) {
                messageContent = `[Document: ${message.message.documentMessage.fileName || 'Unknown'}]`;
            } else if (message.message.stickerMessage) {
                messageContent = '[Sticker]';
            } else {
                messageContent = '[Other message type]';
            }
        }
        
        // Get group metadata for group name
        let groupName = 'Unknown Group';
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            groupName = groupMetadata.subject;
        } catch (error) {
            // If we can't get group metadata, use group ID
            groupName = groupId;
        }
        
        // If discovery mode is enabled, log all group info
        if (config?.settings?.discoveryMode) {
            await discoverGroupInfo(sock, message);
        }
        
        // Check if this group should be monitored
        if (!shouldMonitorGroup(groupId, groupName)) {
            // Log filtered message for debugging (only show first time per group)
            if (!global.filteredGroups) global.filteredGroups = new Set();
            if (!global.filteredGroups.has(groupId)) {
                log('DEBUG', `Filtering out message from group: ${groupName} (${groupId}) - not in configured target groups`);
                global.filteredGroups.add(groupId);
            }
            return;
        }
        
        // Format sender information
        let senderName = 'Unknown Sender';
        if (senderId) {
            try {
                // Try to get contact name
                const contact = await sock.onWhatsApp(senderId);
                if (contact && contact.length > 0) {
                    senderName = contact[0].notify || senderId.split('@')[0];
                } else {
                    senderName = senderId.split('@')[0];
                }
            } catch (error) {
                senderName = senderId ? senderId.split('@')[0] : 'Unknown';
            }
        }
        
        // Log the message
        const logEntry = {
            timestamp: formatTimestamp(timestamp),
            groupId,
            groupName,
            senderId,
            senderName,
            messageId,
            content: messageContent
        };
        
        console.log('\n' + '='.repeat(80));
        log('MESSAGE', `New group message received:`);
        console.log(`  Group: ${groupName} (${groupId})`);
        console.log(`  Sender: ${senderName} (${senderId})`);
        console.log(`  Time: ${formatTimestamp(timestamp)}`);
        console.log(`  Content: ${messageContent}`);
        console.log('='.repeat(80) + '\n');
        
        // Process distribution requests if this is a text message
        if (message.message?.conversation || message.message?.extendedTextMessage) {
            await processDistributionRequest(sock, groupId, messageContent);
        }
        
        // Optional: Save to file for persistence
        await saveMessageToFile(logEntry);
        
    } catch (error) {
        log('ERROR', `Failed to log group message: ${error.message}`);
    }
}

/**
 * Save message to log file
 * @param {object} logEntry - Message log entry
 */
async function saveMessageToFile(logEntry) {
    try {
        const logDir = './logs';
        await fs.ensureDir(logDir);
        
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(logDir, `messages-${today}.json`);
        
        let existingLogs = [];
        if (await fs.pathExists(logFile)) {
            const content = await fs.readFile(logFile, 'utf8');
            try {
                existingLogs = JSON.parse(content);
            } catch (error) {
                log('WARN', 'Failed to parse existing log file, starting fresh');
                existingLogs = [];
            }
        }
        
        existingLogs.push(logEntry);
        await fs.writeFile(logFile, JSON.stringify(existingLogs, null, 2));
        
    } catch (error) {
        log('ERROR', `Failed to save message to file: ${error.message}`);
    }
}

/**
 * Handle process termination gracefully
 */
process.on('SIGINT', () => {
    log('INFO', 'Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('INFO', 'Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Start the bot
if (require.main === module) {
    startWhatsAppBot().catch((error) => {
        log('ERROR', `Failed to start bot: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { startWhatsAppBot, log };