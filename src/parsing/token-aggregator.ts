import { TranscriptLine, AggregatedTokenUsage } from '../types';

export function aggregateTokenUsage(lines: TranscriptLine[]): AggregatedTokenUsage {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let apiCallCount = 0;

  const seenRequestIds = new Set<string>();

  for (const line of lines) {
    if (line.type !== 'assistant' || !line.message?.usage) continue;
    // Skip streaming intermediates (only count final messages)
    if (line.message.stop_reason === null) continue;

    const reqId = line.requestId;
    if (reqId && seenRequestIds.has(reqId)) continue;
    if (reqId) seenRequestIds.add(reqId);

    const usage = line.message.usage;
    totalInputTokens += usage.input_tokens ?? 0;
    totalOutputTokens += usage.output_tokens ?? 0;
    totalCacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    totalCacheReadTokens += usage.cache_read_input_tokens ?? 0;
    apiCallCount++;
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens:
      totalInputTokens +
      totalOutputTokens +
      totalCacheCreationTokens +
      totalCacheReadTokens,
    apiCallCount,
  };
}
