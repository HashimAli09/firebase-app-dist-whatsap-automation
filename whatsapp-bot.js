const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');

// Directory to store authentication state
const AUTH_STATE_DIR = './auth-state';
const CONFIG_FILE = './config.json';

// Ensure auth state directory exists
fs.ensureDirSync(AUTH_STATE_DIR);

// Global configuration
let config = null;

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
                    caseSensitiveGroupNames: false
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
                caseSensitiveGroupNames: false
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
        
        // Check if this group should be monitored
        if (!shouldMonitorGroup(groupId, groupName)) {
            // Skip logging for groups not in our target list
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