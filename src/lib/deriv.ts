// Deriv WebSocket connection manager.
// Public API: wss://ws.derivws.com/websockets/v3?app_id=<APP_ID>
// Default public app_id = 1089 (Deriv-provided demo id, safe to use for public data).

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

interface PendingRequest {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type TickListener = (tick: TickData) => void;
type StatusListener = (status: ConnectionStatus) => void;

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

export interface TickData {
  symbol: string;
  quote: number;
  epoch: number;
  pipSize: number;
  lastDigit: number;
}

interface HistoryResponse {
  history: { prices: number[]; times: number[] };
  pip_size: number;
  symbol: string;
  subscription?: { id: string };
}

interface TickResponse {
  tick: { symbol: string; quote: number; epoch: number; pip_size?: number };
}

class DerivClient {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pending = new Map<number, PendingRequest>();
  private tickListeners = new Map<string, Set<TickListener>>();
  private statusListeners = new Set<StatusListener>();
  private subscriptions = new Map<string, string>(); // symbol -> subscription_id
  private symbolPipSize = new Map<string, number>();
  private status: ConnectionStatus = "closed";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  getStatus() {
    return this.status;
  }

  onStatus(cb: StatusListener) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      try {
        this.setStatus("connecting");
        const ws = new WebSocket(DERIV_WS_URL);
        this.ws = ws;

        ws.onopen = () => {
          this.setStatus("open");
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          resolve();
        };

        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            this.handleMessage(data);
          } catch (e) {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          this.setStatus("error");
        };

        ws.onclose = () => {
          this.ws = null;
          this.setStatus("closed");
          // reject any pending requests
          this.pending.forEach((p) => {
            clearTimeout(p.timeout);
            p.reject(new Error("WebSocket closed"));
          });
          this.pending.clear();
          if (this.shouldReconnect) {
            this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 2500);
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.tickListeners.clear();
  }

  private handleMessage(data: any) {
    if (data.req_id !== undefined && this.pending.has(data.req_id)) {
      const p = this.pending.get(data.req_id)!;
      clearTimeout(p.timeout);
      this.pending.delete(data.req_id);
      if (data.error) {
        p.reject(new Error(data.error.message || "API error"));
      } else {
        p.resolve(data);
      }
    }

    if (data.msg_type === "history" && data.history) {
      const r = data as HistoryResponse;
      this.symbolPipSize.set(r.symbol, r.pip_size);
      if (r.subscription?.id) {
        this.subscriptions.set(r.symbol, r.subscription.id);
      }
    }

    if (data.msg_type === "tick" && data.tick) {
      const t = data.tick as TickResponse["tick"];
      const pipSize = t.pip_size ?? this.symbolPipSize.get(t.symbol) ?? 2;
      this.symbolPipSize.set(t.symbol, pipSize);
      const lastDigit = this.extractLastDigit(t.quote, pipSize);
      const tickData: TickData = {
        symbol: t.symbol,
        quote: t.quote,
        epoch: t.epoch,
        pipSize,
        lastDigit,
      };
      const listeners = this.tickListeners.get(t.symbol);
      if (listeners) listeners.forEach((cb) => cb(tickData));
    }
  }

  private extractLastDigit(quote: number, pipSize: number): number {
    // Multiply by 10^pipSize and take the ones digit.
    const factor = Math.pow(10, pipSize);
    const scaled = Math.round(quote * factor);
    return scaled % 10;
  }

  private send(payload: any, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not open"));
        return;
      }
      const id = this.reqId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Request timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ ...payload, req_id: id }));
    });
  }

  async subscribeTicks(symbol: string, count = 1000): Promise<HistoryResponse> {
    const res = (await this.send({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: "latest",
      style: "ticks",
      subscribe: 1,
    })) as HistoryResponse;
    return res;
  }

  async forgetSubscription(subId: string) {
    try {
      await this.send({ forget: subId }, 5000);
    } catch {
      // ignore
    }
  }

  addTickListener(symbol: string, cb: TickListener) {
    if (!this.tickListeners.has(symbol)) {
      this.tickListeners.set(symbol, new Set());
    }
    this.tickListeners.get(symbol)!.add(cb);
    return () => {
      this.tickListeners.get(symbol)?.delete(cb);
    };
  }

  async unsubscribeSymbol(symbol: string) {
    const subId = this.subscriptions.get(symbol);
    if (subId) {
      await this.forgetSubscription(subId);
      this.subscriptions.delete(symbol);
    }
    this.tickListeners.delete(symbol);
  }
}

// Singleton client shared across the app.
export const derivClient = new DerivClient();
