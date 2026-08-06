const Bottleneck = require('bottleneck');

// ドメインごとのレートリミッターを管理
const limiters = new Map();

function getLimiter(domain, options = {}) {
  if (!limiters.has(domain)) {
    limiters.set(domain, new Bottleneck({
      maxConcurrent: options.maxConcurrent || 1,
      minTime: options.minTime || 3000,
      reservoir: options.reservoir || null,
      reservoirRefreshAmount: options.reservoirRefreshAmount || null,
      reservoirRefreshInterval: options.reservoirRefreshInterval || null,
    }));
  }
  return limiters.get(domain);
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

async function throttledRequest(url, requestFn, options = {}) {
  const domain = getDomainFromUrl(url);
  const limiter = getLimiter(domain, {
    minTime: options.intervalMs || 3000,
    maxConcurrent: options.maxConcurrent || 1,
  });
  return limiter.schedule(() => requestFn(url));
}

module.exports = { getLimiter, getDomainFromUrl, throttledRequest };
