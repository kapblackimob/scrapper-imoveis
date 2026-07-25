import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch(HttpException)
export class ErrorHandler implements ExceptionFilter {
	catch(exception: HttpException, host: ArgumentsHost) {
		// Em contexto GraphQL não existe response HTTP: repassa para o Apollo formatar
		if (host.getType<string>() === "graphql") {
			return exception;
		}

		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		const request = ctx.getRequest<Request>();
		const status = exception.getStatus();

		response.status(status).json({
			message: exception.message,
			statusCode: status,
			timestamp: new Date().toISOString(),
			path: request.url,
		});
	}
}
