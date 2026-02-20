import crypto from 'crypto';

// ── User ID ──

export const generateUserId = (): string => crypto.randomUUID();

export const isValidUserId = (id: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ── Username Generator ──

const adjectives = [
    'Swift', 'Sharp', 'Steady', 'Silent', 'Golden',
    'Iron', 'Keen', 'Brave', 'Crimson', 'Silver',
    'Storm', 'Frost', 'Shadow', 'Dawn', 'Wild',
    'Noble', 'Bold', 'Rapid', 'Fierce', 'Dusk',
];

const nouns = [
    'Archer', 'Arrow', 'Hawk', 'Falcon', 'Hunter',
    'Ranger', 'Scout', 'Striker', 'Marksman', 'Bolt',
    'Quiver', 'Bow', 'Raven', 'Wolf', 'Fox',
    'Eagle', 'Lynx', 'Viper', 'Stag', 'Owl',
];

export const generateUsername = (): string => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
};
