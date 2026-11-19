/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const targetUsername = 'hill';

async function migrate() {
    try {
        // 1. Find target user ID
        const result = await pool.query('SELECT id FROM users WHERE username = $1', [targetUsername]);
        const user = result.rows[0];

        if (!user) {
            console.error(`User '${targetUsername}' not found.`);
            process.exit(1);
        }

        console.log(`Found user '${targetUsername}' with ID: ${user.id}`);

        // 2. Update orphaned decks (user_id IS NULL)
        const orphanedInfo = await pool.query('UPDATE decks SET user_id = $1 WHERE user_id IS NULL', [user.id]);
        console.log(`Migrated ${orphanedInfo.rowCount} orphaned decks to user '${targetUsername}'.`);

    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await pool.end();
    }
}

migrate();
