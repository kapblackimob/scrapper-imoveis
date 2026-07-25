// Extrai cidade/UF a partir do título do imóvel, quando o formato do site permite
export const extractLocation = (
	websiteSlug: string,
	title: string
): { city?: string; state?: string } => {
	if (websiteSlug === "caixa") {
		// Títulos da Caixa seguem o formato "CIDADE - BAIRRO"
		const city = title.split(" - ")[0]?.trim();
		if (city) {
			return { city, state: "SP" };
		}
	}

	return {};
};
