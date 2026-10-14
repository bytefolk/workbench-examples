/** 每次网络往返最多 20 秒；保留调用方取消信号，不重试任何请求。 */
export function createTimeoutFetch(
  fetcher: typeof fetch = fetch,
  timeoutMs = 20000,
): typeof fetch {
  return async (input, init) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signals = [deadline];
    if (input instanceof Request) signals.push(input.signal);
    if (init?.signal) signals.push(init.signal);
    const signal = AbortSignal.any(signals);
    try {
      return await fetcher(input, { ...init, signal });
    } catch (error) {
      if (deadline.aborted)
        throw new Error("网络请求超时，请刷新确认保存结果后再重试。");
      throw error;
    }
  };
}
