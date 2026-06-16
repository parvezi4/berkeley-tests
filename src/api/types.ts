/**
 * Response/request types for the Berkeley Card Issuing API.
 *
 * These model the *observable contract* as documented. Because we test
 * black-box, these types double as a lightweight contract: if Berkeley changes
 * a field, the compiler flags every test that relied on it.
 *
 * Many endpoints wrap their payload in a top-level `data` envelope; some do not.
 * `unwrap()` in the client normalises that.
 */

export interface Envelope<T> {
  data: T;
}

export interface CreateCardholderRequest {
  program_id: number;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  middle_name?: string;
  date_of_birth?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  external_tag?: string;
  load_amount?: number;
  shipping_method?: string;
  locale?: string;
}

export interface ValueLoadResult {
  code: string;
  message: string;
}

export interface CreateCardholderResponse {
  id: number;
  company_id?: string;
  created_at?: string;
  external_tag?: string;
  primary_processor_reference: string;
  bank_details?: {
    account_number: string;
    institution_number: string;
    transit_number: string;
  };
  value_load_result?: ValueLoadResult;
}

export type AccountStatusCode =
  | 'active'
  | 'not_active'
  | 'suspended'
  | 'expired'
  | 'canceled'
  | 'cancelled'
  | 'lost'
  | 'stolen'
  | 'shipping'
  | 'delinquent'
  | 'shipped';

export interface Card {
  last_four_digits?: string;
  [key: string]: unknown;
}

export interface Account {
  id: number;
  cardholder_id?: number;
  processor_reference?: string;
  status_code?: AccountStatusCode;
  balance?: string;
  cards?: Card[];
}

export interface AccountBalance {
  settled_balance: string;
  available_balance: string;
  balance: string;
}

export interface Program {
  id: number;
  name: string;
  program_type: string;
  status: string;
  currency: string;
}

export interface CreateValueLoadRequest {
  account_id: number;
  amount: number;
  external_tag?: string;
  message?: string;
  idempotency_key?: string;
}

export interface ValueLoad {
  id: number;
  account_id?: number;
  amount?: number;
  load_type?: string;
  external_tag?: string;
}

export interface ListResponse<T> {
  count?: number;
  data: T[];
  limit?: number;
  offset?: number;
}

export interface ApiError {
  error?: {
    code?: string;
    message?: string;
  };
}
