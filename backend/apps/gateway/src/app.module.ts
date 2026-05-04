import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Modules organize the application's structure
// it bundles related components, services, and controllers together so Nest knows how to resolve dependencies and manage the application's structure.

@Module({
  imports: [], // Other modules that this module depends on would be listed here (eg. AuthModule, UserModule, etc.)
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
