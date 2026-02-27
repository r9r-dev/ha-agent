export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export class HAClient {
  private baseUrl: string;
  private token: string;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/$/, '');
    this.token = token;
  }

  private async apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HA API ${response.status}: ${body || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async ping(): Promise<void> {
    await this.apiFetch<{ message: string }>('/');
  }

  async getState(entityId: string): Promise<HAState> {
    return this.apiFetch<HAState>(`/states/${entityId}`);
  }

  async getStates(): Promise<HAState[]> {
    return this.apiFetch<HAState[]>('/states');
  }

  async getStatesByDomain(domain: string): Promise<HAState[]> {
    const states = await this.getStates();
    return states.filter((s) => s.entity_id.startsWith(`${domain}.`));
  }

  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.apiFetch(`/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  }

  async getHistory(entityId: string, hours = 24): Promise<HAState[][]> {
    const start = new Date(Date.now() - hours * 3_600_000).toISOString();
    return this.apiFetch<HAState[][]>(
      `/history/period/${start}?filter_entity_id=${entityId}&minimal_response`
    );
  }

  /**
   * Connects to the HA WebSocket API and subscribes to events.
   * Automatically reconnects on disconnect.
   */
  startEventListener(
    eventType: string,
    handler: (event: HAEvent) => void
  ): void {
    const wsUrl = this.baseUrl.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws')) + '/api/websocket';
    const token = this.token;

    const connect = () => {
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data as string) as WSMessage;

        if (data.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        } else if (data.type === 'auth_ok') {
          ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: eventType }));
        } else if (data.type === 'result' && data.id === 1) {
          if (data.success) {
            console.log(`[HA] Subscribed to "${eventType}" events`);
          } else {
            console.error('[HA] Subscription failed:', data.error);
          }
        } else if (data.type === 'event') {
          handler(data.event as HAEvent);
        }
      };

      ws.onerror = (err) => {
        console.error('[HA] WebSocket error:', err);
      };

      ws.onclose = () => {
        console.warn('[HA] WebSocket closed, reconnecting in 10s...');
        setTimeout(connect, 10_000);
      };
    };

    connect();
  }
}

interface WSMessage {
  type: string;
  id?: number;
  success?: boolean;
  error?: { message: string };
  event?: unknown;
}

export interface HAEvent {
  event_type: string;
  data: {
    entity_id?: string;
    old_state?: HAState;
    new_state?: HAState;
  };
  time_fired: string;
}
