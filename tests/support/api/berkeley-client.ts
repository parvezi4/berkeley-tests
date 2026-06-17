import { type APIRequestContext, type APIResponse } from '@playwright/test';
import { config } from '../utils/config.js';
import type {
  Account,
  AccountBalance,
  CreateCardholderRequest,
  CreateCardholderResponse,
  CreateValueLoadRequest,
  ListResponse,
  Program,
  ValueLoad,
} from './types.js';

/**
 * Thin, typed wrapper around the Berkeley Card Issuing API.
 *
 * Responsibilities:
 *  - build URLs from the stable `card_issuing` path,
 *  - attach the bearer token to every call,
 *  - normalise the inconsistent `data` envelope,
 *  - return the raw APIResponse for status/negative assertions.
 *
 * Tests assert on status codes themselves; the client never throws on non-2xx,
 * so negative-path tests can inspect the response.
 */
export class BerkeleyClient {
  constructor(private readonly request: APIRequestContext) {}

  private path(...segments: (string | number)[]): string {
    return `/${config.cardIssuingPath}/${segments.join('/')}`;
  }

  private get headers() {
    return { Authorization: `Bearer ${config.apiKey}` };
  }

  /** Normalise `{ data: T }` envelopes (some endpoints wrap, some don't). */
  static unwrap<T>(body: unknown): T {
    if (body && typeof body === 'object' && 'data' in body) {
      return (body as { data: T }).data;
    }
    return body as T;
  }

  // ---------- Programs ----------
  getProgram(programId = config.programId): Promise<APIResponse> {
    return this.request.get(this.path('programs', programId), { headers: this.headers });
  }

  getProgramBalance(programId = config.programId): Promise<APIResponse> {
    return this.request.get(this.path('programs', programId, 'balance'), { headers: this.headers });
  }

  // ---------- Cardholders ----------
  createCardholder(body: CreateCardholderRequest): Promise<APIResponse> {
    return this.request.post(this.path('cardholders'), { headers: this.headers, data: body });
  }

  getCardholder(cardholderId: number): Promise<APIResponse> {
    return this.request.get(this.path('cardholders', cardholderId), { headers: this.headers });
  }

  listCardholders(params?: { limit?: number; offset?: number }): Promise<APIResponse> {
    return this.request.get(this.path('cardholders'), { headers: this.headers, params });
  }

  updateCardholder(cardholderId: number, body: Record<string, unknown>): Promise<APIResponse> {
    return this.request.post(this.path('cardholders', cardholderId), {
      headers: this.headers,
      data: body,
    });
  }

  // ---------- Accounts & Cards ----------
  getAccountByProcessorReference(processorReference: string): Promise<APIResponse> {
    return this.request.get(this.path('accounts'), {
      headers: this.headers,
      params: { processor_reference: processorReference },
    });
  }

  getAccount(accountId: number): Promise<APIResponse> {
    return this.request.get(this.path('accounts', accountId), { headers: this.headers });
  }

  getAccountBalance(accountId: number): Promise<APIResponse> {
    return this.request.get(this.path('accounts', accountId, 'balance'), { headers: this.headers });
  }

  getAccountTransactions(
    accountId: number,
    params?: { page?: number; limit?: number },
  ): Promise<APIResponse> {
    return this.request.get(this.path('accounts', accountId, 'transactions'), {
      headers: this.headers,
      params,
    });
  }

  modifyAccountStatus(
    accountId: number,
    status: string,
    lastFourDigits?: string,
  ): Promise<APIResponse> {
    return this.request.post(this.path('accounts', accountId) + '/', {
      headers: this.headers,
      data: { status, last_four_digits: lastFourDigits },
    });
  }

  // ---------- Value Loads ----------
  createValueLoad(body: CreateValueLoadRequest): Promise<APIResponse> {
    return this.request.post(this.path('value_loads', 'load'), {
      headers: this.headers,
      data: body,
    });
  }

  createValueUnload(body: CreateValueLoadRequest): Promise<APIResponse> {
    return this.request.post(this.path('value_loads', 'unload'), {
      headers: this.headers,
      data: body,
    });
  }

  listValueLoads(params?: {
    program_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<APIResponse> {
    return this.request.get(this.path('value_loads'), { headers: this.headers, params });
  }

  getValueLoad(valueLoadId: number): Promise<APIResponse> {
    return this.request.get(this.path('value_loads', valueLoadId), { headers: this.headers });
  }

  // ---------- Unauthenticated probe (for the security test) ----------
  getProgramWithToken(token: string, programId = config.programId): Promise<APIResponse> {
    return this.request.get(this.path('programs', programId), {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

// Re-export helpers so tests can import named types alongside the client.
export type {
  Account,
  AccountBalance,
  CreateCardholderResponse,
  ListResponse,
  Program,
  ValueLoad,
};
