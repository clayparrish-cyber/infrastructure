// Command Center API Client
interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

export class CommandCenterClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ApiError(response.status, error);
    }

    return response.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
}

export function createClient(urlOverride?: string): CommandCenterClient {
  const apiKey = process.env.COMMAND_CENTER_API_KEY;
  if (!apiKey) {
    console.error('Error: COMMAND_CENTER_API_KEY environment variable not set.');
    console.error('Fix: export COMMAND_CENTER_API_KEY=your-key-here');
    process.exit(1);
  }

  const baseUrl = urlOverride || process.env.COMMAND_CENTER_URL || 'https://app.mainlineapps.com';

  return new CommandCenterClient({ apiKey, baseUrl });
}
