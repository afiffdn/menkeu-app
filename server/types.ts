import type {
  AccountType,
  Attachment,
  BillFrequency,
  BillStatus,
  BudgetPeriod,
  FamilyRole,
  InvestmentType,
  SpaceType,
  TransactionType,
} from '../src/types/finance';

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  phone?: string | null;
  occupation?: string | null;
  birth_date?: string | null;
  address?: string | null;
  avatar_url: string | null;
  currency: string;
  created_at: string;
}

export interface TokenRecord {
  token: string;
  user_id: number;
  device_name: string;
  created_at: string;
  expires_at: string;
}

export interface FamilyRecord {
  id: number;
  name: string;
  owner_id: number;
  description: string | null;
  head_of_family?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  created_at: string;
}

export interface FamilyMemberRecord {
  id: number;
  family_id: number;
  user_id: number;
  role: FamilyRole;
  relationship?: string | null;
  can_view_private: boolean;
  joined_at: string;
}

export interface AccountRecord {
  id: number;
  user_id: number;
  family_id: number | null;
  name: string;
  type: AccountType;
  initial_balance: number;
  current_balance: number;
  currency: string;
  space: SpaceType;
  description: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryRecord {
  id: number;
  family_id: number | null;
  user_id: number | null;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  color: string | null;
  is_system: boolean;
}

export interface AttachmentRecord extends Attachment {
  user_id: number;
}

export interface TransactionRecord {
  id: number;
  reference_code: string;
  user_id: number;
  family_id: number | null;
  type: TransactionType;
  category_id: number | null;
  account_id: number;
  to_account_id: number | null;
  amount: number;
  space: SpaceType;
  transaction_date: string;
  notes: string | null;
  idempotency_key: string | null;
  attachment_id: number | null;
  is_asset_allocation: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetRecord {
  id: number;
  user_id: number;
  family_id: number | null;
  category_id: number;
  period: BudgetPeriod;
  month: number | null;
  year: number;
  space: SpaceType;
  amount_limit: number;
  created_at: string;
}

export interface SavingsGoalRecord {
  id: number;
  user_id: number;
  family_id: number | null;
  account_id: number | null;
  name: string;
  target_amount: number;
  current_amount: number;
  start_date: string;
  target_date: string;
  space: SpaceType;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
}

export interface SavingsContributionRecord {
  id: number;
  savings_goal_id: number;
  user_id: number;
  source_account_id: number | null;
  amount: number;
  contribution_date: string;
  notes: string | null;
  created_at: string;
}

export interface EmergencyFundRecord {
  id: number;
  user_id: number;
  family_id: number | null;
  name: string;
  target_amount: number;
  current_amount: number;
  space: SpaceType;
  account_ids: number[];
  created_at: string;
}

export interface EmergencyFundTransactionRecord {
  id: number;
  emergency_fund_id: number;
  user_id: number;
  type: 'deposit' | 'withdrawal';
  account_id: number | null;
  amount: number;
  transaction_date: string;
  notes: string | null;
  created_at: string;
}

export interface InvestmentRecord {
  id: number;
  user_id: number;
  family_id: number | null;
  name: string;
  platform: string;
  asset_code?: string | null;
  type: InvestmentType;
  purchase_date: string;
  units: number;
  unit_label: string;
  buy_price_per_unit: number;
  total_cost: number;
  current_market_price: number;
  space: SpaceType;
  price_source: 'manual' | 'provider';
  updated_at: string;
}

export interface InvestmentTransactionRecord {
  id: number;
  investment_id: number;
  user_id: number;
  type: 'buy' | 'sell' | 'dividend';
  account_id: number | null;
  units: number;
  price_per_unit: number;
  total_amount: number;
  transaction_date: string;
  notes: string | null;
  created_at: string;
}

export interface BillRecord {
  id: number;
  user_id: number;
  family_id: number | null;
  category_id: number | null;
  account_id: number | null;
  name: string;
  amount: number;
  due_date: string;
  frequency: BillFrequency;
  space: SpaceType;
  status: BillStatus;
  reminder_days_before: number;
  created_at: string;
}

export interface BillPaymentRecord {
  id: number;
  bill_id: number;
  user_id: number;
  account_id: number;
  amount_paid: number;
  paid_date: string;
  notes: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  is_read: boolean;
  created_at: string;
}

export interface DatabaseState {
  nextIds: Record<string, number>;
  users: UserRecord[];
  tokens: TokenRecord[];
  families: FamilyRecord[];
  family_members: FamilyMemberRecord[];
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  attachments: AttachmentRecord[];
  transactions: TransactionRecord[];
  budgets: BudgetRecord[];
  savings_goals: SavingsGoalRecord[];
  savings_contributions: SavingsContributionRecord[];
  emergency_funds: EmergencyFundRecord[];
  emergency_fund_transactions: EmergencyFundTransactionRecord[];
  investments: InvestmentRecord[];
  investment_transactions: InvestmentTransactionRecord[];
  bills: BillRecord[];
  bill_payments: BillPaymentRecord[];
  notifications: NotificationRecord[];
}
