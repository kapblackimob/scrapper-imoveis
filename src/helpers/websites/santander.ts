import { InternalServerErrorException } from "@nestjs/common";
import axios from "axios";
import { load } from "cheerio";
import { ImovelDataDto } from "../../endpoints/imoveis/ImovelDataDto";
import { Website } from "../../graphql.schema";
import { convertToNumber } from "../convertionsToTypes";

// ============================================================
// Santander Imóveis (santanderimoveis.com.br) — fonte OFICIAL do banco.
// A listagem vem da API REST pública do WordPress (post type
// estate_property); só o preço/metragem exigem a página de detalhe.
//
// A Page cadastrada no banco é a query string da busca, ex.: "?search=sao carlos"
// (a busca do WP casa com o título, que sempre traz "Cidade/UF Código: ...").
//
// Parâmetros extras (nossos, não vão pro WordPress):
//   uf=SP      → mantém só imóveis dessa UF (a busca do WP é solta e traz
//                strays, ex.: "sao carlos" casa com "Rua Carlos Bier" no RS)
//   cidade=... → mantém só a cidade exata (comparação sem acento)
// Ex. de Page: "?search=sao carlos&uf=SP&cidade=Sao Carlos"
//
// A API lista também imóveis já vendidos/retirados (a página deles vira 404);
// a busca do detalhe sem preço descarta esses sozinha.
// ============================================================

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const POR_PAGINA = 100;
// Trava de volume por Page configurada (5 x 100 = até 500 imóveis)
const MAX_PAGINAS_LISTA = 5;
// Requisições de detalhe simultâneas (preço/metragem)
const DETALHES_SIMULTANEOS = 4;

type ItemWp = {
	id: number;
	link: string;
	title?: { rendered?: string };
	yoast_head_json?: { og_image?: { url?: string }[] };
};

const decodeHtml = (s: string): string => load(`<x>${s}</x>`)("x").text();

const semAcento = (s: string): string =>
	s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim();

export const santander = async (
	websiteData: Website,
	pagina: string
): Promise<ImovelDataDto[]> => {
	try {
		const params = new URLSearchParams(pagina.replace(/^\?/, ""));
		const filtroUf = params.get("uf")?.toUpperCase() ?? null;
		const filtroCidade = params.get("cidade") ?? null;
		params.delete("uf");
		params.delete("cidade");

		const itens = await listarTodos(websiteData.baseUrl, `?${params.toString()}`);

		const imoveis: ImovelDataDto[] = [];

		// Enriquecimento com concorrência limitada para não martelar o site
		for (let i = 0; i < itens.length; i += DETALHES_SIMULTANEOS) {
			const lote = itens.slice(i, i + DETALHES_SIMULTANEOS);
			const resultados = await Promise.all(lote.map(montarImovel));
			imoveis.push(
				...resultados.filter((x): x is ImovelDataDto => x !== null)
			);
		}

		return imoveis.filter(
			(im) =>
				(!filtroUf || im.state === filtroUf) &&
				(!filtroCidade || semAcento(im.city ?? "") === semAcento(filtroCidade))
		);
	} catch (err) {
		throw new InternalServerErrorException(
			{ websiteData, pagina },
			{ description: "Erro ao buscar os imóveis do Santander", cause: err }
		);
	}
};

async function listarTodos(baseUrl: string, query: string): Promise<ItemWp[]> {
	const sep = query.includes("?") ? "&" : "?";
	const itens: ItemWp[] = [];

	for (let paginaAtual = 1; paginaAtual <= MAX_PAGINAS_LISTA; paginaAtual++) {
		const url = `${baseUrl}/wp-json/wp/v2/estate_property${query}${sep}per_page=${POR_PAGINA}&page=${paginaAtual}`;

		const resp = await axios.get<ItemWp[]>(url, {
			headers: { "User-Agent": UA },
			// página além do total responde 400 — tratamos como fim da lista
			validateStatus: (s) => s === 200 || s === 400,
		});

		if (resp.status === 400 || !Array.isArray(resp.data)) break;
		itens.push(...resp.data);

		const totalPaginas = Number(resp.headers["x-wp-totalpages"] ?? 1);
		if (paginaAtual >= totalPaginas) break;
	}

	return itens;
}

async function montarImovel(item: ItemWp): Promise<ImovelDataDto | null> {
	const tituloCompleto = decodeHtml(item.title?.rendered ?? "");
	const url = item.link;
	if (!tituloCompleto || !url) return null;

	// "Prédio à venda na Rua Aquidaban – São Carlos/SP Código: 02.27107 | Santander Imóveis"
	const codigo = tituloCompleto.match(/C[óo]digo:\s*([\d.]+)/)?.[1];
	const localizacao = tituloCompleto.match(
		/[–-]\s*([^–\-/|]+)\/([A-Z]{2})\s*C[óo]digo/
	);
	const tipo = tituloCompleto.match(/^([A-Za-zÀ-ú ]+?)\s+à venda/)?.[1]?.trim();

	const title = tituloCompleto.replace(/\s*\|\s*Santander Im[óo]veis\s*$/, "");

	// Código oficial do banco = slug estável (mudança de preço vira update, não duplicata)
	const slug = `santander-${codigo ?? item.id}`;

	const detalhe = await buscarDetalhe(url);
	if (!detalhe) return null;

	return {
		slug,
		title,
		url,
		description: title,
		amount: detalhe.amount,
		type: tipo || null,
		image: item.yoast_head_json?.og_image?.[0]?.url ?? null,
		size: detalhe.size,
		status: "venda direta",
		city: localizacao?.[1]?.trim() ?? null,
		state: localizacao?.[2] ?? null,
	};
}

async function buscarDetalhe(
	url: string
): Promise<{ amount: number; size: string | null } | null> {
	try {
		const resp = await axios.get<string>(url, {
			headers: { "User-Agent": UA },
			timeout: 20_000,
		});

		const $ = load(resp.data);

		// <p>Valor de venda</p> <strong class="value"><small>A partir de</small> R$ 540.000</strong>
		const precoTexto = $("strong.value")
			.first()
			.clone()
			.children()
			.remove()
			.end()
			.text()
			.trim();

		const amount = convertToNumber(precoTexto);
		if (!Number.isFinite(amount) || amount <= 0) return null;

		const size = resp.data.match(/(\d+(?:[.,]\d+)?)\s*m²/)?.[0] ?? null;

		return { amount, size };
	} catch {
		// detalhe fora do ar não derruba a rodada — o imóvel entra na próxima
		return null;
	}
}
