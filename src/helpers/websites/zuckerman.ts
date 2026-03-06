import { InternalServerErrorException } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";
import * as qs from "querystring";
import { ImovelDataDto } from "../../endpoints/imoveis/ImovelDataDto";
import { Website } from "../../graphql.schema";
import { convertImovelType } from "../convertionsToTypes";
import { encrypt } from "../crypt";

export const zuckerman = async (websiteData: Website, pagina: string) => {
        const imoveisData: ImovelDataDto[] = [];
        const baseUrl = "https://www.portalzuk.com.br";
        const pageUrl = `${baseUrl}${pagina}`;

        try {
                // Passo 1: GET para obter token CSRF e cookies da sessão
                const getResponse = await axios.get(pageUrl, {
                        headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        },
                });

                const token = getResponse.data.match(/name="_token"\s+value="([^"]+)"/)?.[1];
                const cookies = getResponse.headers["set-cookie"]
                        ?.map((c: string) => c.split(";")[0])
                        .join("; ");

                if (!token) throw new Error("Token CSRF não encontrado");

                // Passo 2: POST para carregar os cards de imóveis
                const postResponse = await axios.post(
                        `${baseUrl}/leilao-de-imoveis/mais`,
                        qs.stringify({
                                limit: 12,
                                count_imovel_zuk: 0,
                                path: pagina,
                                bounds: "",
                                order: "menor-preco",
                                div_parceiro_count: 0,
                                _token: token,
                        }),
                        {
                                headers: {
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                        "Content-Type": "application/x-www-form-urlencoded",
                                        "Referer": pageUrl,
                                        "X-Requested-With": "XMLHttpRequest",
                                        "Cookie": cookies,
                                },
                        }
                );

                const $ = cheerio.load(postResponse.data);

                $(".card-property").each(function () {
                        const title = $(this)
                                .find(".card-property-address > span:last-of-type")
                                .text()
                                .trim();

                        const amountText = $(this)
                                .find(".card-property-prices:last-of-type li:last-child .card-property-price-value")
                                .clone()
                                .children()
                                .remove()
                                .end()
                                .text()
                                .replace(/R\$/g, "")
                                .replace(/\./g, "")
                                .replace(",", ".")
                                .trim();

                        const amount = parseFloat(amountText);
                        if (isNaN(amount) || !title) return;

                        const url = `${$(this).find(".card-property-image-wrapper > a").attr("href")}`;
                        const image = `${$(this).find(".card-property-image-wrapper > a > img").attr("src")}`;
                        const description = `${$(this).find(".card-property-image-wrapper > a > img").attr("alt")}`;
                        const size = `${$(this).find(".card-property-info-label").text()}`;
                        const type = `${$(this).find(".card-property-prices > li:first-of-type > span").text()}`;
                        const status = `${$(this).find(".cd-it-r2-1").text().toLowerCase().replace("Leilão ", "")}`;

                        const slug = encrypt(`${title}${description}${amount}`);

                        const imovelData: ImovelDataDto = {
                                slug,
                                title,
                                amount,
                                status,
                                description,
                                image,
                                size,
                                type: convertImovelType(type),
                                url,
                        };

                        imoveisData.push(imovelData);
                });

                return imoveisData;

        } catch (err) {
                throw new InternalServerErrorException(
                        { websiteData, pagina, pageUrl },
                        { description: "Erro ao pegar as informações do imovel", cause: err }
                );
        }
};
