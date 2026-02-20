import { createClient, createDatabase, createRelations, createSchema } from 'monarch-orm';
import { string, date, number } from 'monarch-orm/types';

// ── Schemas ──

const UserSchema = createSchema('users', {
    userId: string(),
    name: string(),
    createdAt: date(),
});

const LeaderboardSchema = createSchema('leaderboard', {
    userId: string(),
    score: number(),
    date: date(),
});

const LeaderboardRelations = createRelations(LeaderboardSchema, ({one}) => ({
    user: one(UserSchema, {
        field: "userId",
        references: "userId"
    }),
}))

// ── Database connection ──

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/archr';

const client = createClient(MONGO_URI);

const { collections } = createDatabase(client.db(), {
    users: UserSchema,
    leaderboard: LeaderboardSchema,
    LeaderboardRelations,
});

export { collections };
