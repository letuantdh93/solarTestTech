import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z from 'zod/v4';
import { config } from '../../../config';
import { AiError, type AiProvider, type StructuredRequest, type StructuredResponse } from './types';

/**
 * Anthropic Claude adapter.
 * - Structured outputs (schema-validated JSON) via beta.messages.parse + betaZodOutputFormat.
 * - Adaptive thinking is the model default; depth is controlled with output_config.effort.
 * - Server-side refusal fallbacks ("default" routing) so a safety decline is retried on a fallback model.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null = null;

  isConfigured() {
    return !!config.anthropicApiKey;
  }

  private getClient() {
    if (!this.client) this.client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 10 * 60 * 1000, maxRetries: 2 });
    return this.client;
  }

  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResponse<z.infer<S>>> {
    if (!this.isConfigured()) throw new AiError('Chưa cấu hình khóa API Anthropic (ANTHROPIC_API_KEY).', 'NOT_CONFIGURED');
    try {
      const response = await this.getClient().beta.messages.parse({
        model: req.model ?? config.aiModel,
        max_tokens: req.maxTokens ?? 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        output_config: { effort: req.effort ?? 'high', format: betaZodOutputFormat(req.schema) },
      });
      if (response.stop_reason === 'refusal') throw new AiError('Mô hình AI từ chối xử lý yêu cầu này. Hãy điều chỉnh nội dung yêu cầu.', 'REFUSED');
      if (response.stop_reason === 'max_tokens') throw new AiError('Kết quả AI bị cắt do vượt giới hạn độ dài. Hãy giảm số lượng câu hỏi.', 'INVALID_OUTPUT');
      if (response.parsed_output == null) throw new AiError('AI trả về dữ liệu không đúng cấu trúc yêu cầu.', 'INVALID_OUTPUT');
      return {
        data: response.parsed_output as z.infer<S>,
        model: response.model,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new AiError('Nhà cung cấp AI đang giới hạn tần suất. Vui lòng thử lại sau.', 'RATE_LIMIT');
      if (e instanceof Anthropic.AuthenticationError) throw new AiError('Khóa API Anthropic không hợp lệ.', 'NOT_CONFIGURED');
      if (e instanceof Anthropic.BadRequestError) throw new AiError(`Yêu cầu AI không hợp lệ: ${e.message}`, 'PROVIDER_ERROR');
      if (e instanceof Anthropic.APIError) throw new AiError(`Lỗi từ nhà cung cấp AI (${e.status ?? 'mạng'}).`, 'PROVIDER_ERROR');
      throw new AiError('Không thể kết nối nhà cung cấp AI.', 'PROVIDER_ERROR');
    }
  }
}
