import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SendMessageResult = { ok: true } | { ok: false; error: string };

export type SendTextResult = SendMessageResult;

export type SendButton = {
  id: string;
  displayText: string;
};

export type SendButtonsInput = {
  title?: string;
  description: string;
  footer?: string;
  buttons: SendButton[];
};

const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class EvolutionApiClient {
  private readonly logger = new Logger(EvolutionApiClient.name);
  private readonly url: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly instance: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('EVOLUTION_API_URL')?.replace(/\/$/, '');
    this.apiKey = this.config.get<string>('EVOLUTION_API_KEY');
    this.instance = this.config.get<string>('EVOLUTION_INSTANCE');
  }

  isConfigured(): boolean {
    return Boolean(this.url && this.apiKey && this.instance);
  }

  async sendText(toPhoneE164: string, text: string): Promise<SendTextResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Evolution API not configured' };
    }

    const endpoint = `${this.url}/message/sendText/${this.instance}`;
    const body = JSON.stringify({ number: toPhoneE164, text });

    return this.postWithRetry(endpoint, body);
  }

  async sendButtons(
    toPhoneE164: string,
    input: SendButtonsInput,
  ): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Evolution API not configured' };
    }

    const endpoint = `${this.url}/message/sendButtons/${this.instance}`;
    const body = JSON.stringify({
      number: toPhoneE164,
      title: input.title ?? '',
      description: input.description,
      footer: input.footer ?? '',
      buttons: input.buttons.map((button) => ({
        type: 'reply',
        displayText: button.displayText,
        id: button.id,
      })),
    });

    return this.postWithRetry(endpoint, body);
  }

  private async postWithRetry(
    endpoint: string,
    body: string,
  ): Promise<SendMessageResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey!,
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.ok) {
          return { ok: true };
        }

        const isRetryable = response.status >= 500;
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        if (!isRetryable || attempt === 1) {
          this.logger.error(
            `Evolution API send failed (${response.status}): ${errorText}`,
          );
          return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
        }
      } catch (error) {
        if (attempt === 1) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Evolution API send failed: ${message}`);
          return { ok: false, error: message };
        }
      }
    }

    return { ok: false, error: 'Unknown send failure' };
  }
}
