import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { metaApi } from '../services/api';
import type { DashboardFilters, SpaceType } from '../types/finance';
import { buildAvailableYears } from '../utils/finance';

interface PeriodContextValue {
  filters: DashboardFilters;
  availableYears: number[];
  dataYears: number[];
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  stepYear: (delta: number) => void;
  setSpace: (space: SpaceType | 'all') => void;
  setMemberId: (memberId: number | 'all') => void;
  setAccountId: (accountId: number | 'all') => void;
  dataVersion: number;
  triggerRefresh: () => void;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const initialDate = useMemo(() => new Date(), []);
  const [filters, setFilters] = useState<DashboardFilters>({
    month: initialDate.getMonth() + 1,
    year: initialDate.getFullYear(),
    space: 'all',
    member_id: 'all',
    account_id: 'all',
  });
  const [dataYears, setDataYears] = useState<number[]>([]);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let active = true;
    metaApi
      .years()
      .then((meta) => {
        if (!active) return;
        setDataYears(meta.data_years);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dataVersion]);

  const availableYears = useMemo(
    () =>
      buildAvailableYears({
        currentYear: new Date().getFullYear(),
        dataYears,
        selectedYear: filters.year,
      }),
    [dataYears, filters.year]
  );

  const triggerRefresh = () => setDataVersion((v) => v + 1);

  return (
    <PeriodContext.Provider
      value={{
        filters,
        availableYears,
        dataYears,
        setMonth: (month) => setFilters((f) => ({ ...f, month })),
        setYear: (year) => setFilters((f) => ({ ...f, year })),
        stepYear: (delta) =>
          setFilters((f) => ({
            ...f,
            year: Math.max(1970, Math.min(2150, f.year + delta)),
          })),
        setSpace: (space) => setFilters((f) => ({ ...f, space })),
        setMemberId: (member_id) => setFilters((f) => ({ ...f, member_id })),
        setAccountId: (account_id) => setFilters((f) => ({ ...f, account_id })),
        dataVersion,
        triggerRefresh,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider');
  return ctx;
}
