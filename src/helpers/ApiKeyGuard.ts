import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";

@Injectable()
export class ApiKeyGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const ctx = GqlExecutionContext.create(context);
		const request = ctx.getContext().req;
		const apiKey = request?.headers?.["x-api-key"];

		// Falha fechado: sem API_KEY configurada no ambiente, nada protegido é liberado
		if (!process.env.API_KEY || apiKey !== process.env.API_KEY) {
			throw new UnauthorizedException(
				"API key inválida ou ausente (header x-api-key)"
			);
		}

		return true;
	}
}
