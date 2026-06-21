import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const action = `${req.method}:${ctx.getClass().name}:${ctx.getHandler().name}`;

    return next.handle().pipe(
      tap((responseData) => {
        this.audit.log({
          userId: user?.id,
          action,
          newValues: typeof responseData === 'object' ? (responseData as Record<string, unknown>) : { value: responseData },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }).catch(() => {}); // Never let audit failure break the response
      }),
    );
  }
}
