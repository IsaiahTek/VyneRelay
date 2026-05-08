import { Injectable, CanActivate, ExecutionContext, Module } from '@nestjs/common';

@Injectable()
export class MultiAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Simple mock: allow if Authorization header exists or if it's a websocket upgrade
    const authHeader = request.headers?.authorization;
    if (authHeader || request.headers?.upgrade === 'websocket') {
      request.user = { id: 'mock-user-123', role: 'admin' };
      return true;
    }
    return true; // For testing, allow all
  }
}

export function MultiAuth() {
  return (target: any, key?: string, descriptor?: any) => {};
}

@Module({
  providers: [MultiAuthGuard],
  exports: [MultiAuthGuard],
})
export class AuthModule {}
