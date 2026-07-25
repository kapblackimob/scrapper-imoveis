import { UseGuards } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Website } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";
import { ApiKeyGuard } from "src/helpers/ApiKeyGuard";
import { Imovel, ImovelResponse, NewImovel } from "./../../graphql.schema";
import { ImoveisService } from "./imoveis.service";

const pubSub = new PubSub();

export type ImovelWithWebsite = Imovel & { website: Website };

@Resolver("Imoveis")
export class ImoveisResolvers {
	constructor(private readonly imoveisService: ImoveisService) {}

	@Query("imoveis")
	async imoveis(): Promise<ImovelWithWebsite[]> {
		return this.imoveisService.findAll();
	}

	@Query("removeAllImoveis")
	@UseGuards(ApiKeyGuard)
	async removeAll(): Promise<void> {
		return this.imoveisService.removeAll();
	}

	@Query("find")
	@UseGuards(ApiKeyGuard)
	async searchImoveis(): Promise<ImovelResponse[]> {
		const imoveisData = await this.imoveisService.searchImoveis();

		return imoveisData;
	}

	@Mutation("createImovel")
	@UseGuards(ApiKeyGuard)
	async createImovel(@Args("imovel") imovel: NewImovel): Promise<Imovel> {
		const createdImovel = this.imoveisService.create(imovel);
		pubSub.publish("imovelCreated", { imovelCreated: createdImovel });
		return createdImovel;
	}
}
