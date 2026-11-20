export type SpaceType = 'pribadi' | 'keluarga' | 'anak';
export type FamilyRole = 'owner' | 'admin' | 'member' | 'viewer';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type AccountType =
  | 'cash'
  | 'bank'
  | 'ewallet'
  | 'savings'
  | 'emergency'
  | 'investment'
  | 'gold';

export type InvestmentType =
  | 'digital_gold'
  | 'mutual_fund'
  | 'stock'
  | 'deposit'
  | 'other';

export type BillFrequency = 'once' | 'weekly' | 'monthly' | 'yearly';
export type BillStatus = 'unpaid' | 'paid' | 'overdue';
export type BudgetPeriod = 'monthly' | 'yearly';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  occupation?: string | null;
  birth_date?: string | null;
  address?: string | null;
  avatar_url?: string | null;
  currency: string;
  created_at: string;
}

export interface FamilyMember {
  id: number;
  family_id: number;
  user_id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: FamilyRole;
  relationship?: string | null;
  can_view_private: boolean;
  joined_at: string;
}

export interface Family {
  id: number;
  name: string;
  owner_id: number;
  description?: string | null;
  head_of_family?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  members: FamilyMember[];
  created_at: string;
}

export interface Account {
  id: number;
  user_id: number;
  owner_name: string;
  family_id: number | null;
  name: string;
  type: AccountType;
  initial_balance: number;
  current_balance: number;
  currency: string;
  space: SpaceType;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  family_id: number | null;
  user_id: number | null;
  name: string;
  type: 'income' | 'expense';
  icon?: string | null;
  color?: string | null;
  is_system: boolean;
}

export interface Attachment {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  reference_code: string;
  user_id: number;
  recorder_name: string;
  family_id: number | null;
  type: TransactionType;
  category_id: number | null;
  category_name: string | null;
  account_id: number;
  account_name: string;
  to_account_id: number | null;
  to_account_name: string | null;
  amount: number;
  space: SpaceType;
  transaction_date: string;
  notes?: string | null;
  idempotency_key?: string | null;
  attachment?: Attachment | null;
  is_asset_allocation?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: number;
  user_id: number;
  owner_name: string;
  family_id: number | null;
  category_id: number;
  category_name: string;
  period: BudgetPeriod;
  month: number | null;
  year: number;
  space: SpaceType;
  amount_limit: number;
  spent_amount: number;
  remaining_amount: number;
  usage_percentage: number;
  status: 'safe' | 'warning' | 'exceeded';
  created_at: string;
}

export interface SavingsContribution {
  id: number;
  savings_goal_id: number;
  user_id: number;
  contributor_name: string;
  source_account_id: number | null;
  source_account_name: string | null;
  amount: number;
  contribution_date: string;
  notes?: string | null;
  created_at: string;
}

export interface SavingsGoal {
  id: number;
  user_id: number;
  owner_name: string;
  family_id: number | null;
  account_id: number | null;
  account_name: string | null;
  name: string;
  target_amount: number;
  current_amount: number;
  progress_percentage: number;
  start_date: string;
  target_date: string;
  space: SpaceType;
  status: 'active' | 'completed' | 'paused';
  contributions?: SavingsContribution[];
  created_at: string;
}

export interface EmergencyFundTransaction {
  id: number;
  emergency_fund_id: number;
  user_id: number;
  actor_name: string;
  type: 'deposit' | 'withdrawal';
  account_id: number | null;
  account_name: string | null;
  amount: number;
  transaction_date: string;
  notes?: string | null;
  created_at: string;
}

export interface EmergencyFund {
  id: number;
  user_id: number;
  owner_name: string;
  family_id: number | null;
  name: string;
  target_amount: number;
  current_amount: number;
  shortfall_amount: number;
  progress_percentage: number;
  space: SpaceType;
  account_ids: number[];
  accounts?: Account[];
  transactions?: EmergencyFundTransaction[];
  history_series?: Array<{ month: string; balance: number }>;
  created_at: string;
}

export interface InvestmentTransaction {
  id: number;
  investment_id: number;
  user_id: number;
  type: 'buy' | 'sell' | 'dividend';
  account_id: number | null;
  account_name: string | null;
  units: number;
  price_per_unit: number;
  total_amount: number;
  transaction_date: string;
  notes?: string | null;
  created_at: string;
}

export interface Investment {
  id: number;
  user_id: number;
  owner_name: string;
  family_id: number | null;
  name: string;
  platform: string;
  type: InvestmentType;
  purchase_date: string;
  units: number;
  unit_label: string;
  buy_price_per_unit: number;
  total_cost: number;
  current_market_price: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percentage: number;
  space: SpaceType;
  price_source: 'manual' | 'provider';
  transactions?: InvestmentTransaction[];
  updated_at: string;
}

export interface BillPayment {
  id: number;
  bill_id: number;
  user_id: number;
  payer_name: string;
  account_id: number;
  account_name: string;
  amount_paid: number;
  paid_date: string;
  notes?: string | null;
  created_at: string;
}

export interface Bill {
  id: number;
  user_id: number;
  owner_name: string;
  family_id: number | null;
  category_id: number | null;
  category_name: string | null;
  account_id: number | null;
  account_name: string | null;
  name: string;
  amount: number;
  due_date: string;
  frequency: BillFrequency;
  space: SpaceType;
  status: BillStatus;
  reminder_days_before: number;
  days_until_due: number;
  payments?: BillPayment[];
  created_at: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  is_read: boolean;
  created_at: string;
}

export interface DashboardSummary {
  total_balance: number;
  monthly_income: number;
  monthly_expense: number;
  monthly_net: number;
  total_savings: number;
  total_emergency_fund: number;
  total_investment_value: number;
  total_net_worth: number;
  budgets: Budget[];
  recent_transactions: Transaction[];
  upcoming_bills: Bill[];
  savings_goals: SavingsGoal[];
  emergency_fund: EmergencyFund | null;
}

export interface CashFlowPoint {
  label: string;
  month: number;
  year: number;
  income: number;
  expense: number;
  net: number;
}

export interface ExpenseCategoryPoint {
  category_id: number;
  category_name: string;
  color: string;
  total: number;
  percentage: number;
}

export interface DashboardFilters {
  month: number;
  year: number;
  space?: SpaceType | 'all';
  member_id?: number | 'all';
  account_id?: number | 'all';
}

export interface AvailableYearsMeta {
  years: number[];
  data_years: number[];
  current_year: number;
  current_month: number;
}

export interface MultiYearPoint {
  year: number;
  income: number;
  expense: number;
  net: number;
  savings_rate: number;
}
