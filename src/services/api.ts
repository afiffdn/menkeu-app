import axios from 'axios';
import type {
  Account,
  ApiSuccessResponse,
  Attachment,
  AvailableYearsMeta,
  Bill,
  Budget,
  CashFlowPoint,
  Category,
  DashboardFilters,
  DashboardSummary,
  EmergencyFund,
  ExpenseCategoryPoint,
  Family,
  FamilyRole,
  Investment,
  MultiYearPoint,
  NotificationItem,
  PaginationMeta,
  SavingsContribution,
  SavingsGoal,
  SpaceType,
  Transaction,
  User,
} from '../types/finance';

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const isIntegratedServer = port === '3000' || hostname.endsWith('.run.app');
    if (isIntegratedServer && (!configured || configured.includes('127.0.0.1:8000') || configured.includes('localhost:8000'))) {
      return '/api/v1';
    }
  }
  return configured || '/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();
const TOKEN_STORAGE_KEY = 'ff_auth_token';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
    if (data?.errors) {
      const firstErr = Object.values(data.errors).flat()[0];
      if (firstErr) return firstErr;
    }
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return 'Terjadi kesalahan saat menghubungi server.';
}

export const authApi = {
  async login(payload: { email: string; password: string }) {
    const res = await apiClient.post<ApiSuccessResponse<{ token: string; user: User }>>('/auth/login', payload);
    return res.data.data;
  },
  async register(payload: { name: string; email: string; password: string; family_name?: string }) {
    const res = await apiClient.post<ApiSuccessResponse<{ token: string; user: User }>>('/auth/register', payload);
    return res.data.data;
  },
  async logout() {
    await apiClient.post('/auth/logout');
  },
  async me() {
    const res = await apiClient.get<ApiSuccessResponse<{ user: User; families: Family[] }>>('/auth/me');
    return res.data.data;
  },
  async updateProfile(payload: {
    name: string;
    email?: string;
    phone?: string | null;
    occupation?: string | null;
    birth_date?: string | null;
    address?: string | null;
    currency?: string;
  }) {
    const res = await apiClient.put<ApiSuccessResponse<User>>('/auth/me', payload);
    return res.data.data;
  },
};

export const dashboardApi = {
  async summary(filters: DashboardFilters) {
    const res = await apiClient.get<ApiSuccessResponse<DashboardSummary>>('/dashboard/summary', { params: filters });
    return res.data.data;
  },
  async cashFlow(filters: DashboardFilters & { months?: number }) {
    const res = await apiClient.get<ApiSuccessResponse<CashFlowPoint[]>>('/dashboard/cash-flow', { params: filters });
    return res.data.data;
  },
  async expenseCategories(filters: DashboardFilters) {
    const res = await apiClient.get<ApiSuccessResponse<ExpenseCategoryPoint[]>>('/dashboard/expense-categories', {
      params: filters,
    });
    return res.data.data;
  },
};

export const accountsApi = {
  async list(space?: SpaceType | 'all') {
    const res = await apiClient.get<ApiSuccessResponse<Account[]>>('/accounts', { params: { space } });
    return res.data.data;
  },
  async create(payload: Partial<Account>) {
    const res = await apiClient.post<ApiSuccessResponse<Account>>('/accounts', payload);
    return res.data.data;
  },
  async update(id: number, payload: Partial<Account>) {
    const res = await apiClient.put<ApiSuccessResponse<Account>>(`/accounts/${id}`, payload);
    return res.data.data;
  },
  async remove(id: number) {
    await apiClient.delete(`/accounts/${id}`);
  },
  async transactions(id: number) {
    const res = await apiClient.get<ApiSuccessResponse<Transaction[]>>(`/accounts/${id}/transactions`);
    return res.data.data;
  },
};

export const categoriesApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<Category[]>>('/categories');
    return res.data.data;
  },
  async create(payload: { name: string; type: 'income' | 'expense'; color?: string }) {
    const res = await apiClient.post<ApiSuccessResponse<Category>>('/categories', payload);
    return res.data.data;
  },
  async remove(id: number) {
    await apiClient.delete(`/categories/${id}`);
  },
};

export const transactionsApi = {
  async list(params: Record<string, string | number | undefined>) {
    const res = await apiClient.get<ApiSuccessResponse<Transaction[]> & { meta: PaginationMeta }>('/transactions', {
      params,
    });
    return { items: res.data.data, meta: res.data.meta! };
  },
  async create(payload: {
    type: 'income' | 'expense' | 'transfer';
    category_id?: number | null;
    account_id: number;
    to_account_id?: number | null;
    amount: number;
    space: SpaceType;
    transaction_date: string;
    notes?: string | null;
    idempotency_key: string;
    attachment_id?: number | null;
  }) {
    const res = await apiClient.post<ApiSuccessResponse<Transaction>>('/transactions', payload, {
      headers: { 'X-Idempotency-Key': payload.idempotency_key },
    });
    return res.data;
  },
  async update(id: number, payload: Record<string, unknown>) {
    const res = await apiClient.put<ApiSuccessResponse<Transaction>>(`/transactions/${id}`, payload);
    return res.data.data;
  },
  async remove(id: number) {
    await apiClient.delete(`/transactions/${id}`);
  },
  async uploadAttachment(file: File): Promise<Attachment> {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Gagal membaca file lampiran.'));
      reader.readAsDataURL(file);
    });
    const res = await apiClient.post<ApiSuccessResponse<Attachment>>('/attachments', {
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      content_base64: base64,
    });
    return res.data.data;
  },
  getExportUrl(format: 'csv' | 'excel', params: Record<string, string | number | undefined>): string {
    const token = getStoredToken() || '';
    const qs = new URLSearchParams();
    qs.set('format', format);
    qs.set('token', token);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== 'all') qs.set(k, String(v));
    }
    return `${API_BASE_URL}/transactions/export?${qs.toString()}`;
  },
};

export const budgetsApi = {
  async list(params: { month?: number; year?: number; space?: SpaceType | 'all' }) {
    const res = await apiClient.get<ApiSuccessResponse<Budget[]>>('/budgets', { params });
    return res.data.data;
  },
  async create(payload: {
    category_id: number;
    period: 'monthly' | 'yearly';
    month?: number | null;
    year: number;
    space: SpaceType;
    amount_limit: number;
  }) {
    const res = await apiClient.post<ApiSuccessResponse<Budget>>('/budgets', payload);
    return res.data.data;
  },
  async update(id: number, payload: { amount_limit?: number; space?: SpaceType }) {
    const res = await apiClient.put<ApiSuccessResponse<Budget>>(`/budgets/${id}`, payload);
    return res.data.data;
  },
  async remove(id: number) {
    await apiClient.delete(`/budgets/${id}`);
  },
};

export const savingsApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<SavingsGoal[]>>('/savings-goals');
    return res.data.data;
  },
  async create(payload: {
    name: string;
    target_amount: number;
    start_date: string;
    target_date: string;
    account_id?: number | null;
    space: SpaceType;
  }) {
    const res = await apiClient.post<ApiSuccessResponse<SavingsGoal>>('/savings-goals', payload);
    return res.data.data;
  },
  async contribute(
    id: number,
    payload: { source_account_id?: number | null; amount: number; contribution_date: string; notes?: string }
  ) {
    const res = await apiClient.post<ApiSuccessResponse<SavingsGoal>>(`/savings-goals/${id}/contributions`, payload);
    return res.data.data;
  },
  async history(id: number) {
    const res = await apiClient.get<ApiSuccessResponse<SavingsContribution[]>>(`/savings-goals/${id}/history`);
    return res.data.data;
  },
};

export const emergencyFundApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<EmergencyFund[]>>('/emergency-funds');
    return res.data.data;
  },
  async create(payload: { name: string; target_amount: number; space: SpaceType; account_ids: number[] }) {
    const res = await apiClient.post<ApiSuccessResponse<EmergencyFund>>('/emergency-funds', payload);
    return res.data.data;
  },
  async update(id: number, payload: { name?: string; target_amount?: number; account_ids?: number[] }) {
    const res = await apiClient.put<ApiSuccessResponse<EmergencyFund>>(`/emergency-funds/${id}`, payload);
    return res.data.data;
  },
  async transact(
    id: number,
    payload: {
      type: 'deposit' | 'withdrawal';
      account_id?: number | null;
      amount: number;
      transaction_date: string;
      notes?: string;
    }
  ) {
    const res = await apiClient.post<ApiSuccessResponse<EmergencyFund>>(`/emergency-funds/${id}/transactions`, payload);
    return res.data.data;
  },
};

export const investmentsApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<Investment[]>>('/investments');
    return res.data.data;
  },
  async create(payload: {
    name: string;
    platform: string;
    type: string;
    purchase_date: string;
    units: number;
    unit_label: string;
    buy_price_per_unit: number;
    current_market_price: number;
    space: SpaceType;
    source_account_id?: number | null;
  }) {
    const res = await apiClient.post<ApiSuccessResponse<Investment>>('/investments', payload);
    return res.data.data;
  },
  async updatePrice(id: number, payload: { current_market_price: number }) {
    const res = await apiClient.put<ApiSuccessResponse<Investment>>(`/investments/${id}`, payload);
    return res.data.data;
  },
  async transact(
    id: number,
    payload: {
      type: 'buy' | 'sell' | 'dividend';
      units: number;
      price_per_unit: number;
      account_id?: number | null;
      transaction_date: string;
      notes?: string;
    }
  ) {
    const res = await apiClient.post<ApiSuccessResponse<Investment>>(`/investments/${id}/transactions`, payload);
    return res.data.data;
  },
};

export const billsApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<Bill[]>>('/bills');
    return res.data.data;
  },
  async create(payload: {
    name: string;
    category_id?: number | null;
    account_id?: number | null;
    amount: number;
    due_date: string;
    frequency: string;
    space: SpaceType;
    reminder_days_before?: number;
  }) {
    const res = await apiClient.post<ApiSuccessResponse<Bill>>('/bills', payload);
    return res.data.data;
  },
  async pay(id: number, payload: { account_id: number; amount_paid: number; paid_date: string; notes?: string }) {
    const res = await apiClient.post<ApiSuccessResponse<Bill>>(`/bills/${id}/payments`, payload);
    return res.data.data;
  },
};

export const familyApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<Family[]>>('/families');
    return res.data.data;
  },
  async create(payload: {
    name: string;
    description?: string;
    head_of_family?: string | null;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
  }) {
    const res = await apiClient.post<ApiSuccessResponse<Family>>('/families', payload);
    return res.data.data;
  },
  async update(
    familyId: number,
    payload: {
      name: string;
      description?: string | null;
      head_of_family?: string | null;
      city?: string | null;
      address?: string | null;
      phone?: string | null;
    }
  ) {
    const res = await apiClient.put<ApiSuccessResponse<Family>>(`/families/${familyId}`, payload);
    return res.data.data;
  },
  async inviteMember(
    familyId: number,
    payload: {
      name: string;
      email: string;
      role: FamilyRole;
      relationship?: string | null;
      can_view_private?: boolean;
    }
  ) {
    const res = await apiClient.post<ApiSuccessResponse<Family>>(`/families/${familyId}/members`, payload);
    return res.data.data;
  },
  async updateMember(
    familyId: number,
    memberId: number,
    payload: { role?: FamilyRole; relationship?: string | null; can_view_private?: boolean }
  ) {
    const res = await apiClient.patch<ApiSuccessResponse<Family>>(`/families/${familyId}/members/${memberId}`, payload);
    return res.data.data;
  },
  async removeMember(familyId: number, memberId: number) {
    const res = await apiClient.delete<ApiSuccessResponse<Family>>(`/families/${familyId}/members/${memberId}`);
    return res.data.data;
  },
};

export const notificationsApi = {
  async list() {
    const res = await apiClient.get<ApiSuccessResponse<NotificationItem[]>>('/notifications');
    return res.data.data;
  },
  async markRead(id: number) {
    await apiClient.post(`/notifications/${id}/read`);
  },
};

export const metaApi = {
  async years() {
    const res = await apiClient.get<ApiSuccessResponse<AvailableYearsMeta>>('/meta/years');
    return res.data.data;
  },
};

export const reportsApi = {
  async monthly(params: DashboardFilters) {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        period: { month: number; year: number };
        summary: DashboardSummary;
        expense_categories: ExpenseCategoryPoint[];
        transactions: Transaction[];
      }>
    >('/reports/monthly', { params });
    return res.data.data;
  },
  async yearly(params: { year: number; space?: SpaceType | 'all' }) {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        year: number;
        total_income: number;
        total_expense: number;
        net_savings: number;
        months: Array<{ month: number; year: number; income: number; expense: number; net: number }>;
      }>
    >('/reports/yearly', { params });
    return res.data.data;
  },
  async multiYear(params?: { start_year?: number; end_year?: number; space?: SpaceType | 'all' }) {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        start_year: number;
        end_year: number;
        series: MultiYearPoint[];
      }>
    >('/reports/multi-year', { params });
    return res.data.data;
  },
  async cashFlow(params: DashboardFilters & { months?: number }) {
    const res = await apiClient.get<ApiSuccessResponse<CashFlowPoint[]>>('/reports/cash-flow', { params });
    return res.data.data;
  },
  async expenses(params: DashboardFilters & { start_date?: string; end_date?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<{ categories: ExpenseCategoryPoint[]; transactions: Transaction[] }>
    >('/reports/expenses', { params });
    return res.data.data;
  },
  async income(params: DashboardFilters & { start_date?: string; end_date?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        categories: Array<{ category_id: number; category_name: string; total: number }>;
        transactions: Transaction[];
      }>
    >('/reports/income', { params });
    return res.data.data;
  },
};
