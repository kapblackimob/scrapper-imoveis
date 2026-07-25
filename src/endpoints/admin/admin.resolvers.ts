import { UseGuards } from "@nestjs/common";
import { Query, Resolver } from "@nestjs/graphql";
import { ApiKeyGuard } from "src/helpers/ApiKeyGuard";
import { AdminService } from "./admin.service";

// const pubSub = new PubSub();

@Resolver("Imoveis")
export class AdminResolvers {
	constructor(private readonly adminService: AdminService) {}

	@Query("removeAll")
	@UseGuards(ApiKeyGuard)
	async removeAll(): Promise<void> {
		this.adminService.removeAll();
	}
}
