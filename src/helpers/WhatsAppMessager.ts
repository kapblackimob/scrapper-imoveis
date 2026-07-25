import axios from "axios";
import { MAX_RETRIES } from "src/constants/configs";

// Envia mensagens via Evolution API (WhatsApp). Canal opcional e best-effort:
// sem as envs configuradas, os envios são silenciosamente ignorados.
export default class WhatsAppMessager {
	private baseUrl = process.env.EVOLUTION_API_URL;
	private apiKey = process.env.EVOLUTION_API_KEY;
	private instance = process.env.EVOLUTION_INSTANCE;
	private recipient = process.env.WHATSAPP_NUMBER;

	public isEnabled(): boolean {
		return Boolean(
			this.baseUrl && this.apiKey && this.instance && this.recipient
		);
	}

	public async sendMessage(text: string) {
		return axios.post(
			`${this.baseUrl}/message/sendText/${this.instance}`,
			{
				number: this.recipient,
				text,
			},
			{
				headers: { apikey: this.apiKey },
			}
		);
	}

	public async sendMessageWithRetry(text: string): Promise<boolean> {
		if (!this.isEnabled()) return false;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				await this.sendMessage(text);
				return true;
			} catch (error) {
				await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
			}
		}
		return false;
	}
}
