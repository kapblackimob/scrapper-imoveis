import { Injectable, InternalServerErrorException } from "@nestjs/common";
import TelegramMessager from "src/helpers/TelegramMessager";
import WhatsAppMessager from "src/helpers/WhatsAppMessager";
import { extractLocation } from "src/helpers/location";
import {
	imoveisDigestText,
	imoveisDigestTextWhats,
	imovelText,
	imovelTextWhats,
} from "src/helpers/text";
import {
	DIGEST_THRESHOLD,
	MAX_PENDING_NOTIFICATIONS,
	MESSAGE_DELAY_MS,
} from "../../constants/configs";
import { PrismaService } from "../../prisma/prisma.service";
import { Imovel, ImovelResponse, NewImovel } from "./../../graphql.schema";
import { ImovelDataDto } from "./ImovelDataDto";
import { ImovelWithWebsite } from "./imoveis.resolvers";
import { scrappImoveis } from "./scrappImoveis";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

@Injectable()
export class ImoveisService {
	constructor(private prisma: PrismaService) {}

	async findAll(): Promise<ImovelWithWebsite[]> {
		return this.prisma.imovel.findMany({
			include: {
				website: true,
			},
		});
	}

	async removeAll(): Promise<void> {
		await this.prisma.priceHistory.deleteMany({});
		await this.prisma.imovel.deleteMany({});
	}

	async create(imovel: NewImovel): Promise<Imovel> {
		return this.prisma.imovel.create({
			data: {
				...imovel,
			},
			include: {
				website: true,
			},
		});
	}

	async searchImoveis(): Promise<ImovelResponse[]> {
		const websites = await this.prisma.website.findMany({
			where: {
				isActive: true,
			},
			include: {
				imoveis: true,
				pages: true,
			},
		});

		const imoveisFinded: ImovelDataDto[] = [];

		await Promise.all(
			websites.map(async (website) => {
				const imoveisScrapped = await scrappImoveis({
					...website,
					imoveis: [],
				});

				// Remove os imoveis indesejados
				const imoveisSelecteds = imoveisScrapped.filter(
					(imovel) => !imovel.type || imovel.type !== "Desconhecido"
				);

				for (const imovelScrapped of imoveisSelecteds) {
					const imovelExists = website.imoveis.find(
						(imovel) => imovel.slug === imovelScrapped.slug
					);
					const location = extractLocation(website.slug, imovelScrapped.title);

					try {
						// é update: só quando houve alteração de valor. Senão é ignorado
						if (imovelExists) {
							if (imovelExists.amount !== imovelScrapped.amount) {
								imoveisFinded.push(imovelScrapped);

								await this.prisma.imovel.update({
									data: {
										...imovelScrapped,
										...location,
										// notifiedAt nulo = entra na fila de avisos pendentes
										notifiedAt: null,
										priceHistory: {
											create: { amount: imovelScrapped.amount },
										},
									},
									where: {
										id: imovelExists.id,
									},
								});
							}

							// é criação
						} else {
							imoveisFinded.push(imovelScrapped);
							await this.prisma.imovel.create({
								data: {
									...imovelScrapped,
									...location,
									websiteId: website.id,
									priceHistory: {
										create: { amount: imovelScrapped.amount },
									},
								},
							});
						}
					} catch (error) {
						throw new InternalServerErrorException(
							imovelExists || imovelScrapped,
							{
								description: "Erro ao criar/atualizar o seguinte imovel",
							}
						);
					}
				}
			})
		);

		await this.notifyPending();

		return imoveisFinded;
	}

	// Envia os avisos pendentes (notifiedAt nulo) de forma sequencial, marcando
	// notifiedAt apenas após envio com sucesso — falha fica pendente para a próxima rodada.
	// O filtro updatedAt != null exclui registros anteriores à coluna (legado já avisado).
	private async notifyPending(): Promise<void> {
		const pending = await this.prisma.imovel.findMany({
			where: {
				notifiedAt: null,
				updatedAt: { not: null },
			},
			orderBy: { updatedAt: "desc" },
			take: MAX_PENDING_NOTIFICATIONS,
			include: { website: true },
		});

		if (!pending.length) return;

		const telegram = new TelegramMessager();
		// WhatsApp é best-effort: falha não impede a marcação de notifiedAt (o Telegram é o canal primário)
		const whatsapp = new WhatsAppMessager();

		// Muitos imoveis: resumo agrupado por site para não estourar o rate limit
		if (pending.length > DIGEST_THRESHOLD) {
			const byWebsite = new Map<string, typeof pending>();
			for (const imovel of pending) {
				const group = byWebsite.get(imovel.websiteId) || [];
				group.push(imovel);
				byWebsite.set(imovel.websiteId, group);
			}

			for (const group of byWebsite.values()) {
				const messages = imoveisDigestText(group, group[0].website.name);

				let allSent = true;
				for (const message of messages) {
					const sent = await telegram.sendMessageWithRetry(message);
					if (!sent) allSent = false;
					await sleep(MESSAGE_DELAY_MS);
				}

				if (whatsapp.isEnabled()) {
					const messagesWhats = imoveisDigestTextWhats(
						group,
						group[0].website.name
					);
					for (const message of messagesWhats) {
						await whatsapp.sendMessageWithRetry(message);
						await sleep(MESSAGE_DELAY_MS);
					}
				}

				if (allSent) {
					await this.prisma.imovel.updateMany({
						where: { id: { in: group.map((imovel) => imovel.id) } },
						data: { notifiedAt: new Date() },
					});
				}
			}

			return;
		}

		// Poucos imoveis: mensagens individuais com intervalo entre envios
		for (const imovel of pending) {
			const sent = await telegram.sendMessageWithRetry(
				imovelText(imovel, imovel.website.name)
			);

			if (sent) {
				await this.prisma.imovel.update({
					where: { id: imovel.id },
					data: { notifiedAt: new Date() },
				});
			}

			await sleep(MESSAGE_DELAY_MS);

			if (whatsapp.isEnabled()) {
				await whatsapp.sendMessageWithRetry(
					imovelTextWhats(imovel, imovel.website.name)
				);
				await sleep(MESSAGE_DELAY_MS);
			}
		}
	}
}
