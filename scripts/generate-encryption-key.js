import crypto from 'crypto';

// Generate a random 32-byte key and convert to hex (64 characters)
const key = crypto.randomBytes(32).toString('hex');

console.log('🔐 Generated AES-256 encryption key:');
console.log(key);
console.log('');
console.log('Add this to your .env file as:');
console.log(`ENCRYPTION_KEY=${key}`);
console.log('');
console.log('⚠️  IMPORTANT: Keep this key secure and never commit it to version control!');
