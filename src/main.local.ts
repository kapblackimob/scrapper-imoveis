import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorHandler } from './helpers/ErrorHandler';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilita CORS
  app.enableCors();
  
  // Adiciona o filtro de erro global
  app.useGlobalFilters(new ErrorHandler());
  
  // Define a porta (usa variável de ambiente ou 3000 como padrão)
  const port = process.env.PORT || 3000;
  
  await app.listen(port);
  
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`GraphQL Playground: http://localhost:${port}/graphql`);
}

bootstrap();
