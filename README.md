# WhatsApp Group Listener Bot

A Node.js bot that connects to WhatsApp using the Baileys library to monitor and log messages from WhatsApp groups.

## Features

- 🔐 **QR Code Authentication**: Authenticate using WhatsApp Web style QR code scanning
- 📱 **Group Message Monitoring**: Automatically logs all messages sent to groups the bot is a member of
- 🎯 **Group Filtering**: Configure specific groups to monitor instead of all groups
- 📊 **Detailed Logging**: Captures sender information, timestamps, and message content
- 💾 **Persistent Authentication**: Saves authentication state locally to avoid re-scanning QR codes
- 📁 **Message Archiving**: Saves message logs to JSON files organized by date
- 🔄 **Auto-Reconnection**: Automatically reconnects if the connection is lost

## Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager
- A phone with WhatsApp installed
- Internet connection

## Installation

1. Clone the repository:
```bash
git clone https://github.com/HashimAli09/firebase-app-dist-whatsap-automation.git
cd firebase-app-dist-whatsap-automation
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the bot:
```bash
npm start
```

2. When prompted, scan the QR code with your WhatsApp app:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device"
   - Scan the QR code displayed in the terminal

3. Once connected, the bot will start monitoring group messages based on your configuration.

## Group Filtering Configuration

The bot can be configured to monitor specific groups instead of all groups. This is useful when you only want to track messages from certain groups.

### Setting up Group Filtering

1. Copy the example configuration:
```bash
cp config.example.json config.json
```

2. Edit `config.json` to specify which groups to monitor:
```json
{
  "targetGroups": [
    {
      "name": "My Important Group",
      "id": null,
      "enabled": true
    },
    {
      "name": "Work Team Chat", 
      "id": "1234567890-1234567890@g.us",
      "enabled": true
    },
    {
      "name": "Family Group",
      "id": null,
      "enabled": false
    }
  ],
  "settings": {
    "logAllGroupsIfEmpty": true,
    "caseSensitiveGroupNames": false
  }
}
```

### Configuration Options

- **`targetGroups`**: Array of groups to monitor
  - **`name`**: Group name to match (required)
  - **`id`**: WhatsApp group ID (optional, will be auto-detected)
  - **`enabled`**: Whether to monitor this group (default: true)

- **`settings`**: Global configuration options
  - **`logAllGroupsIfEmpty`**: Monitor all groups if no specific groups are configured (default: true)
  - **`caseSensitiveGroupNames`**: Whether group name matching is case-sensitive (default: false)
  - **`discoveryMode`**: When enabled, logs all group IDs and names to help with configuration (default: false)

### How to Obtain Group IDs

There are several ways to get WhatsApp group IDs for configuration:

#### Method 1: Auto-Detection (Recommended)
1. Add the group name to your configuration with `"id": null`
2. Start the bot and wait for a message from that group
3. The bot will automatically detect and save the group ID

#### Method 2: Discovery Mode
1. Set `"discoveryMode": true` in your config.json settings
2. Start the bot and let it run for a while
3. The bot will display all group IDs and names as messages come in
4. Copy the group information to your configuration
5. Set `"discoveryMode": false` to return to normal operation

#### Method 3: Manual Inspection
1. Start the bot without any group filtering (empty targetGroups array)
2. Check the console output when messages arrive - group IDs are shown in parentheses
3. Look for the format: `Group: Group Name (120363043968732014-1634567890@g.us)`
4. The group ID is the part in parentheses: `120363043968732014-1634567890@g.us`

**Example Discovery Mode Output:**
```
================================================================================
[2024-01-01 12:00:00.000] [DISCOVERY] Found WhatsApp Group:
  Name: My Work Team
  ID: 120363043968732014-1634567890@g.us
  Add to config.json under targetGroups:
  {
    "name": "My Work Team",
    "id": "120363043968732014-1634567890@g.us",
    "enabled": true
  }
================================================================================
```

### How Group Filtering Works

1. **By Group Name**: The bot matches group names specified in the configuration
2. **Auto-Detection**: When a message is received from a matching group, the bot automatically saves the group ID for faster future matching
3. **Fallback**: If no groups are configured or enabled, the bot monitors all groups (based on `logAllGroupsIfEmpty` setting)

## Output Format

The bot logs messages in the following format:

```
================================================================================
[2024-01-01 12:00:00.000] [MESSAGE] New group message received:
  Group: My Group Name (@groupid@g.us)
  Sender: John Doe (+1234567890@s.whatsapp.net)
  Time: 2024-01-01 12:00:00.000
  Content: Hello everyone!
================================================================================
```

## File Structure

```
├── whatsapp-bot.js          # Main bot script
├── package.json             # Node.js dependencies and scripts
├── config.json              # Group filtering configuration (created on first run)
├── config.example.json      # Example configuration file
├── auth-state/              # WhatsApp authentication state (auto-created)
├── logs/                    # Daily message log files (auto-created)
│   └── messages-YYYY-MM-DD.json
└── README.md               # This file
```

## Configuration

The bot creates the following directories and files automatically:
- `auth-state/`: Stores WhatsApp session data for persistent authentication
- `logs/`: Stores daily message logs in JSON format
- `config.json`: Group filtering configuration (created with defaults on first run)

You can customize group filtering by editing `config.json` after the first run or by copying from `config.example.json`.

## Security Notes

- The `auth-state/` directory contains sensitive WhatsApp session data and should never be shared
- The `config.json` file may contain group names and IDs - handle with care if it contains sensitive information
- Log files may contain private message content - handle with care
- The `.gitignore` file is configured to exclude sensitive directories and configuration from version control

## Troubleshooting

### QR Code Not Appearing
- Ensure you have a stable internet connection
- Try restarting the bot with `npm start`

### Connection Issues
- The bot will automatically attempt to reconnect
- If problems persist, delete the `auth-state/` directory and re-authenticate

### Bot Not Receiving Messages
- Ensure the bot account is added to the groups you want to monitor
- Check that the WhatsApp session is still active on your phone
- Verify your group configuration in config.json
- Check if group filtering is working correctly - enable discoveryMode to see all available groups

### Group Filtering Issues
- **Bot ignoring messages from a group**: Check if the group name in config.json matches exactly (unless caseSensitiveGroupNames is false)
- **Group ID not being saved**: Ensure the bot has received at least one message from the group after adding it to config
- **Too many messages**: Set specific groups in targetGroups and disable logAllGroupsIfEmpty
- **Missing groups**: Enable discoveryMode temporarily to see all available groups and their IDs

## Message Types Supported

- ✅ Text messages
- ✅ Images (with captions)
- ✅ Videos (with captions)  
- ✅ Audio messages
- ✅ Documents
- ✅ Stickers
- ✅ Other message types (generic handling)

## Development

To modify the bot behavior, edit `whatsapp-bot.js`. Key functions:

- `startWhatsAppBot()`: Initializes the WhatsApp connection
- `logGroupMessage()`: Handles incoming group messages
- `saveMessageToFile()`: Saves messages to log files

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License - see the package.json file for details.

## Disclaimer

This bot is for educational and automation purposes. Please respect WhatsApp's Terms of Service and user privacy when using this tool.
