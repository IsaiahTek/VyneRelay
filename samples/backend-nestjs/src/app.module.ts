import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RealtimeModule } from './realtime.module.js';

@Module({
  imports: [RealtimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
