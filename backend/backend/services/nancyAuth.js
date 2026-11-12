const crypto = require('crypto');

const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = 'nancy_session';

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createNancySession(userId, secret, now = Date.now()) {
    if (!secret || secret.length < 32) throw new Error('NANCY_AUTH_SECRET must be at least 32 characters.');
    const payload = Buffer.from(JSON.stringify({
        userId,
        expiresAt: Math.floor(now / 1000) + SESSION_SECONDS,
        nonce: crypto.randomBytes(16).toString('base64url')
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function getNancySession(req, secret, now = Date.now()) {
    if (!secret || secret.length < 32) return null;
    const cookieHeader = String(req.headers.cookie || '');
    const cookie = cookieHeader.split(';').map(part => part.trim())
        .find(part => part.startsWith(`${COOKIE_NAME}=`));
    if (!cookie) return null;

    const token = cookie.slice(COOKIE_NAME.length + 1);
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payload, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!safeEqual(signature, expected)) return null;

    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!claims.userId || !Number.isInteger(claims.expiresAt) || claims.expiresAt <= Math.floor(now / 1000)) return null;
        return String(claims.userId);
    } catch (error) {
        return null;
    }
}

function verifyTotp(secret, token, now = Date.now()) {
    if (!/^\d{6}$/.test(String(token || ''))) return false;
    const key = decodeBase32(secret);
    if (!key || key.length === 0) return false;

    const counter = Math.floor(now / 30000);
    for (let offset = -1; offset <= 1; offset += 1) {
        const message = Buffer.alloc(8);
        message.writeBigUInt64BE(BigInt(counter + offset));
        const digest = crypto.createHmac('sha1', key).update(message).digest();
        const index = digest[digest.length - 1] & 0x0f;
        const code = String((digest.readUInt32BE(index) & 0x7fffffff) % 1000000).padStart(6, '0');
        if (safeEqual(code, token)) return true;
    }
    return false;
}

function decodeBase32(value) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const input = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
    let buffer = 0;
    let bits = 0;
    const bytes = [];

    for (const character of input) {
        const index = alphabet.indexOf(character);
        if (index < 0) return null;
        buffer = (buffer << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
            buffer &= (1 << bits) - 1;
        }
    }

    return Buffer.from(bytes);
}

module.exports = { COOKIE_NAME, SESSION_SECONDS, createNancySession, getNancySession, verifyTotp };