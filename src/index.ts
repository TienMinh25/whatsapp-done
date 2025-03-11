import fs from "fs";
import qrcode from "qrcode";
import { Client, Events, LocalAuth } from "whatsapp-web.js";
import * as cli from "./cli/ui";
import constants from "./constants";
import { addNewContact, checkIfContactExists, closeDB, initDB, saveChatHistory, updateContactStatus } from "./database";
import { initAiConfig } from "./handlers/ai-config";
import { handleIncomingMessage } from "./handlers/message";
import { initOpenAI } from "./providers/openai";

const SCAN_LOCK_FILE = "scan.lock";
let botReadyTimestamp: Date | null = null;

const start = async () => {
	const wwebVersion = "2.2412.54";
	cli.printIntro();

	const client = new Client({
		puppeteer: { args: ["--no-sandbox"] },
		authStrategy: new LocalAuth({ dataPath: constants.sessionPath }),
		webVersionCache: {
			type: "remote",
			remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`
		}
	});

	client.on(Events.QR_RECEIVED, (qr) => {
		qrcode.toString(qr, { type: "terminal", small: true, margin: 2, scale: 1 }, (err, url) => {
			if (err) throw err;
			cli.printQRCode(url);
		});
	});

	client.on(Events.LOADING_SCREEN, (percent) => {
		if (percent == "0") cli.printLoading();
	});

	client.on(Events.AUTHENTICATED, () => cli.printAuthenticated());
	client.on(Events.AUTHENTICATION_FAILURE, () => cli.printAuthenticationFailure());

	client.on(Events.READY, async () => {
		cli.printOutro();
		botReadyTimestamp = new Date();
		initAiConfig();
		initOpenAI();
		await initDB();

		if (!fs.existsSync(SCAN_LOCK_FILE)) {
			await scanChatHistory(client);
		} else {
			console.log("🔹 Scan đã hoàn thành trước đó, bỏ qua!");
		}
	});

	client.on(Events.MESSAGE_CREATE, async (message) => {
		console.log(` ${message.from}: ${message.body}`);

		if (!message.hasMedia) {
			await saveChatHistory([
				{
					chat_id: message.from.replace("@c.us", ""),
					phone: message.from,
					message: message.body,
					fromMe: message.fromMe,
					timestamp: new Date(message.timestamp * 1000),
					title: message.title || ""
				}
			]);
		}

		if (message.from == constants.statusBroadcast || message.hasQuotedMsg || message.fromMe) {
			return;
		}

		const exists = await checkIfContactExists(message.from);
		const delay = Math.floor(Math.random() * 9000) + 1000; // 1s - 10s

		if (!exists) {
			console.log(`🆕 Brand new account: ${message.from}, send the first welcome message...`);
			await addNewContact(message.from);

			setTimeout(async () => {
				await client.sendMessage(
					message.from,
					`Hola beautiful, como estas? 🙂\n\nIf you want to apply now for the job, you can go to https://appplyx.com`
				);
			}, delay);
		}

		setTimeout(async () => {
			await handleIncomingMessage(message, client);
		}, delay);
	});

	const shutdown = async () => {
		console.log("\n🛑 Đang dừng server...");
		await client.destroy();
		await closeDB();
		console.log("✅ Server đã tắt.");
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	client.initialize();
};

const scanChatHistory = async (client) => {
	console.log("📌 Đang quét lịch sử chat...");
	let messagesToSave: any[] = [];
	try {
		const chats = await client.getChats();

		if (chats.length === 0) {
			console.log("⚠️ Không có cuộc trò chuyện nào.");
			return;
		}

		for (const chat of chats) {
			const messages = await chat.fetchMessages({ limit: 100 });

			for (const msg of messages) {
				if (msg.body !== "") {
					messagesToSave.push({
						chat_id: chat.id.user,
						phone: chat.id.user + "@c.us",
						message: msg.body,
						fromMe: msg.fromMe,
						timestamp: new Date(msg.timestamp * 1000),
						title: msg._data.notifyName
					});
				}
			}
		}
		if (messagesToSave.length > 0) await saveChatHistory(messagesToSave);
		fs.writeFileSync(SCAN_LOCK_FILE, "done");
	} catch (err) {
		console.error("❌ Lỗi khi quét tin nhắn:", err);
	}
};

start();

export { botReadyTimestamp };
