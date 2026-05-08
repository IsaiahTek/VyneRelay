import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Main NestJS app on 3000, VynRelay on 3001
  await app.listen(3000);
  console.log(`Application is running on: http://localhost:3000`);
}
bootstrap();
