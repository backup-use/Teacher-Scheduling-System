const db = require('./db');
const crypto = require('crypto');

async function createAdmin() {
    try {
        const hash = crypto.createHash('sha256').update('admin123' + 'salt_key_2024').digest('hex');
        
        await db.query('DELETE FROM users WHERE username = $1', ['admin']);
        
        await db.query(
            'INSERT INTO users (id, username, password, role, name) VALUES ($1, $2, $3, $4, $5)',
            ['admin-001', 'admin', hash, 'admin', 'Administrator']
        );
        
        console.log('SUCCESS: Admin user created!');
        process.exit(0);
    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
}

createAdmin();