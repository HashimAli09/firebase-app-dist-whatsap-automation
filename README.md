# WhatsApp Group Listener Bot

A Node.js bot that connects to WhatsApp using the Baileys library to monitor and log messages from WhatsApp groups.

## Features

- 🔐 **QR Code Authentication**: Authenticate using WhatsApp Web style QR code scanning
- 📱 **Group Message Monitoring**: Automatically logs all messages sent to groups the bot is a member of
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

3. Once connected, the bot will start monitoring all group messages and log them to the console.

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
├── auth-state/              # WhatsApp authentication state (auto-created)
├── logs/                    # Daily message log files (auto-created)
│   └── messages-YYYY-MM-DD.json
└── README.md               # This file
```

## Configuration

The bot creates the following directories automatically:
- `auth-state/`: Stores WhatsApp session data for persistent authentication
- `logs/`: Stores daily message logs in JSON format

## Security Notes

- The `auth-state/` directory contains sensitive WhatsApp session data and should never be shared
- Log files may contain private message content - handle with care
- The `.gitignore` file is configured to exclude sensitive directories from version control

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
