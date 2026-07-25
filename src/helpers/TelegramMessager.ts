import TelegramBot from "node-telegram-bot-api";
import { MAX_RETRIES } from "src/constants/configs";
import Vars from "src/helpers/variables";

export default class TelegramMessager {
	public bot: TelegramBot;

	constructor() {
		// polling desabilitado: o bot apenas envia mensagens. Com polling ativo,
		// cada execução criava um poller que nunca era encerrado (409 Conflict).
		this.bot = new TelegramBot(Vars.TELEGRAM_BOT_TOKEN, { polling: false });
	}

	public async sendMessage(sendMessage: string) {
		return this.bot.sendMessage(Vars.TELEGRAM_BOT_CHATID, sendMessage, {
			parse_mode: "HTML",
		});
	}

	// Envia respeitando o retry_after do Telegram. Retorna false se todas as tentativas falharem.
	public async sendMessageWithRetry(text: string): Promise<boolean> {
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				await this.sendMessage(text);
				return true;
			} catch (error) {
				const retryAfter = error?.response?.body?.parameters?.retry_after;
				const waitMs = retryAfter
					? (retryAfter + 1) * 1000
					: 5000 * (attempt + 1);
				await new Promise((res) => setTimeout(res, waitMs));
			}
		}
		return false;
	}
}
