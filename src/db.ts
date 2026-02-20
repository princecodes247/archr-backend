import { createClient, createDatabase, createSchema } from 'monarch-orm';
import { string, date, number } from 'monarch-orm/types';

// ── Schemas ──

const UserSchema = createSchema('users', {
    userId: string(),
    createdAt: date(),
});

const LeaderboardSchema = createSchema('leaderboard', {
    userId: string(),
    score: number(),
    date: date(),
});

// ── Database connection ──

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/archr';

const client = createClient(MONGO_URI);

const { collections } = createDatabase(client.db(), {
    users: UserSchema,
    leaderboard: LeaderboardSchema,
});

export { collections };
