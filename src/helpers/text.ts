import { InternalServerErrorException } from "@nestjs/common";
import { Imovel } from "src/graphql.schema";
import { formataDinheiro } from "./number";

// Limite real do Telegram é 4096 chars; margem para o header e formatação
const TELEGRAM_MESSAGE_LIMIT = 3500;

const imovelOptionalDataText = (imovelData: Imovel): string => {
	let str = "";

	imovelData.size &&
		(str += `<b>Metragem:</b> ${escapeHtml(imovelData.size)}
`);
	imovelData.type &&
		(str += `<b>Tipo:</b> ${escapeHtml(imovelData.type)}
`);
	imovelData.status &&
		(str += ` <b>Status:</b> ${escapeHtml(imovelData.status)}
`);
	imovelData.description &&
		(str += `
${escapeHtml(imovelData.description)}
`);

	return str;
};

export function stripHtmlTags(input: string): string {
	return input.replace(/<\/?[^>]+(>|$)/g, "");
}

// Campos scrapeados podem conter <, > e & que quebram o parse_mode HTML do Telegram
export function escapeHtml(input?: string | null): string {
	if (!input) return "";
	return stripHtmlTags(input)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export const imovelText = (
	imovelData: Imovel,
	websiteName: string
): string | null => {
	try {
		const text = `

		<span class="tg-spoiler">${imovelData.image}</span>
		<b>Site: </b>${escapeHtml(websiteName)}
		<b>Nome: </b> ${escapeHtml(
			imovelData.title.replace(
				/[A-Za-záàâãéèêíïóôõöúçñÁÀÂÃÉÈÍÏÓÔÕÖÚÇÑ ]+$/,
				""
			)
		)}
		<b>Valor: </b> ${formataDinheiro(imovelData.amount)}
		${imovelOptionalDataText(imovelData)}
		<b>Link:</b> ${imovelData.url}
		`;

		return text;
	} catch (error) {
		throw new InternalServerErrorException(imovelData, {
			description: "Erro ao montar a string de texto do imovel",
		});
	}
};

// Resumo agrupado usado quando há imoveis demais para mensagens individuais.
// Retorna uma lista de mensagens respeitando o limite de tamanho do Telegram.
export const imoveisDigestText = (
	imoveis: Imovel[],
	websiteName: string
): string[] => {
	const header = `🏠 <b>${escapeHtml(websiteName)}</b>: ${
		imoveis.length
	} imóveis novos ou com preço alterado\n\n`;

	const lines = imoveis.map((imovel) => {
		const local = escapeHtml(imovel.city || imovel.title);
		const tipo = imovel.type ? ` — ${escapeHtml(imovel.type)}` : "";
		return `• ${local}${tipo} — ${formataDinheiro(
			imovel.amount
		)} — <a href="${imovel.url}">ver</a>`;
	});

	const messages: string[] = [];
	let current = header;

	for (const line of lines) {
		if (current.length + line.length > TELEGRAM_MESSAGE_LIMIT) {
			messages.push(current);
			current = "";
		}
		current += `${line}\n`;
	}
	if (current.trim().length) messages.push(current);

	return messages;
};

export const imovelNotFoundText = (siteName: string) => {
	return `
<b>${siteName}</b>

Nenhum imóvel novo encontrado`;
};
