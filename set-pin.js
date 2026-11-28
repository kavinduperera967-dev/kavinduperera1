// Usage:  node set-pin.js 123456
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const pin = process.argv[2];
if (!pin || pin.length < 4) { console.log('Usage: node set-pin.js YOUR_PIN   (at least 4 characters)'); process.exit(1); }
const salt = crypto.randomBytes(16).toString('hex');
fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify({ salt, hash: crypto.scryptSync(pin, salt, 32).toString('hex') }));
console.log('PIN saved. Restart the server.');
