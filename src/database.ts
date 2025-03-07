import { Pool } from "pg";
import { config } from "./config";

export interface Message {
	chat_id: string;
	phone: string;
	message: string;
	fromMe: boolean;
	timestamp: Date;
}

interface Contact {
	id: number;
	phone: string;
	hasMessaged: boolean;
}

interface Chat {
	chat_id: string;
	title: string | null;
	created_at: Date;
}

const pool = new Pool({
	user: config.postgresUsername,
	host: config.postgresHost,
	database: config.postgresDB,
	password: config.postgresPassword,
	port: config.postgresPort
});

const initDB = async (): Promise<void> => {
	await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,  
      chat_id VARCHAR(50) UNIQUE NOT NULL,
      title VARCHAR(255) NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

	await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,  
      phone VARCHAR(20) UNIQUE NOT NULL,
      has_messaged BOOLEAN DEFAULT FALSE
    );
  `);

	await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,  
      chat_id VARCHAR(50) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      message TEXT NOT NULL,
      from_me BOOLEAN NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id),
      FOREIGN KEY (phone) REFERENCES contacts(phone)
    );
  `);

	console.log("✅ Database initialized with 3 tables (chats, contacts, messages)!");
};

const saveChatHistory = async (messages: Message[]): Promise<void> => {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		for (const msg of messages) {
			const { chat_id, phone, message, fromMe, timestamp } = msg;

			await addNewChat(chat_id, null);

			const exists = await checkIfContactExists(phone);
			if (!exists) {
				await addNewContact(phone);
			}

			await client.query(
				"INSERT INTO messages (chat_id, phone, message, from_me, timestamp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
				[chat_id, phone, message, fromMe, timestamp]
			);
		}

		await client.query("COMMIT");
		console.log(`✅ Saved ${messages.length} messages into the database.`);
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("❌ Error while saving chat history:", err);
	} finally {
		client.release();
	}
};

const checkIfContactExists = async (phone: string): Promise<boolean> => {
	const res = await pool.query("SELECT 1 FROM contacts WHERE phone = $1", [phone]);
	return res.rowCount > 0;
};

const addNewContact = async (phone: string): Promise<void> => {
	await pool.query("INSERT INTO contacts (phone, has_messaged) VALUES ($1, true) ON CONFLICT DO NOTHING", [phone]);
};

const addNewChat = async (chat_id: string, title: string | null): Promise<void> => {
	await pool.query("INSERT INTO chats (chat_id, title) VALUES ($1, $2) ON CONFLICT DO NOTHING", [chat_id, title]);
};

const updateContactStatus = async (phone: string): Promise<void> => {
	await pool.query("UPDATE contacts SET has_messaged = true WHERE phone = $1", [phone]);
};

const closeDB = async (): Promise<void> => {
	await pool.end();
	console.log("✅ Closed the database connection.");
};

export { initDB, saveChatHistory, checkIfContactExists, closeDB, addNewContact, updateContactStatus, addNewChat };
