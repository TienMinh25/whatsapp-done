CREATE TABLE IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,  
  chat_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,  
  phone VARCHAR(20) UNIQUE NOT NULL,
  has_messaged BOOLEAN DEFAULT FALSE,
);

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