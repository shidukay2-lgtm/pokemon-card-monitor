class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  _time() {
    return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  }

  info(msg, ...args) {
    console.log(`[${this._time()}] [INFO] ${this.prefix} ${msg}`, ...args);
  }

  warn(msg, ...args) {
    console.warn(`[${this._time()}] [WARN] ${this.prefix} ${msg}`, ...args);
  }

  error(msg, ...args) {
    console.error(`[${this._time()}] [ERROR] ${this.prefix} ${msg}`, ...args);
  }

  debug(msg, ...args) {
    if (process.env.DEBUG) {
      console.log(`[${this._time()}] [DEBUG] ${this.prefix} ${msg}`, ...args);
    }
  }
}

module.exports = { Logger };
