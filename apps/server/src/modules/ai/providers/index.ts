import { config } from '../../../config';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import type { AiProvider } from './types';

let provider: AiProvider | null = null;
/** Provider registry: add new providers here (e.g. other vendors) without touching business logic. */
export function getProvider(): AiProvider {
  if (!provider) provider = config.aiProvider === 'mock' ? new MockProvider() : new AnthropicProvider();
  return provider;
}
export * from './types';
