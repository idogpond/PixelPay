import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class SmsChannel {
  private readonly logger = new Logger(SmsChannel.name);
  private client: ReturnType<typeof twilio>;
  private from: string;

  constructor(private config: ConfigService) {
    this.client = twilio(
      config.get<string>('TWILIO_ACCOUNT_SID'),
      config.get<string>('TWILIO_AUTH_TOKEN'),
    );
    this.from = config.get<string>('TWILIO_FROM') ?? '';
  }

  async send(to: string, body: string): Promise<void> {
    try {
      await this.client.messages.create({ from: this.from, to, body });
    } catch (error: any) {
      this.logger.error(`SMS send failed to ${to}: ${error.message}`);
      // Don't rethrow — SMS failure shouldn't break the order flow
    }
  }
}
