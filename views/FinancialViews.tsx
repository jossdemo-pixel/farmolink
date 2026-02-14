import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Toast } from '../components/UI';
import { CommissionStatus, Order, SettlementCycle } from '../types';
import {
    applyCommissionPaymentByPeriodByAdmin,
    DEFAULT_FINANCIAL_SETTLEMENT_CYCLE,
    fetchFinancialLedgerEntries,
    fetchFinancialSettlementCycle,
    FinancialLedgerEntry,
    fetchPharmacies,
    saveFinancialSettlementCycle
} from '../services/dataService';
import { fetchOrders } from '../services/orderService';
import { Activity, AlertTriangle, Building2, Calendar, Clock3, Landmark, Loader2, RefreshCw, Settings2, ShieldCheck, Wallet } from 'lucide-react';
import { playSound } from '../services/soundService';

type PeriodSummary = {
    periodKey: string;
    ordersCount: number;
    commission: number;
    paid: number;
    outstanding: number;
    status: CommissionStatus;
};

type PharmacyOption = {
    id: string;
    name: string;
};

const normalizeOrderStatus = (status?: string) =>
    (status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();

const isCompletedOrderStatus = (status?: string) => {
    const normalized = normalizeOrderStatus(status);
    return normalized === 'CONCLUIDO' || normalized === 'COMPLETED';
};

const getIsoWeek = (date: Date): { week: number; year: number } => {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNr = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNr);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { week: weekNo, year: target.getUTCFullYear() };
};

const getPeriodKeyFromDate = (date: Date, cycle: SettlementCycle): string | null => {
    if (Number.isNaN(date.getTime())) return null;
    if (cycle === 'WEEKLY') {
        const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const { week, year } = getIsoWeek(utcDate);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const getPeriodKeyFromOrder = (order: Order, cycle: SettlementCycle): string | null => {
    const sourceDate = order.createdAt ? new Date(order.createdAt) : new Date(order.date);
    return getPeriodKeyFromDate(sourceDate, cycle);
};

const comparePeriodKeysAsc = (a: string, b: string, cycle: SettlementCycle) => {
    if (cycle === 'WEEKLY') {
        const [aYearRaw, aWeekRaw] = a.split('-W');
        const [bYearRaw, bWeekRaw] = b.split('-W');
        const aYear = Number(aYearRaw);
        const bYear = Number(bYearRaw);
        const aWeek = Number(aWeekRaw);
        const bWeek = Number(bWeekRaw);
        if (Number.isNaN(aYear) || Number.isNaN(bYear) || Number.isNaN(aWeek) || Number.isNaN(bWeek)) {
            return a.localeCompare(b);
        }
        if (aYear !== bYear) return aYear - bYear;
        return aWeek - bWeek;
    }

    const [aMonthRaw, aYearRaw] = a.split('/');
    const [bMonthRaw, bYearRaw] = b.split('/');
    const aYear = Number(aYearRaw);
    const bYear = Number(bYearRaw);
    const aMonth = Number(aMonthRaw);
    const bMonth = Number(bMonthRaw);
    if (Number.isNaN(aYear) || Number.isNaN(bYear) || Number.isNaN(aMonth) || Number.isNaN(bMonth)) {
        return a.localeCompare(b);
    }
    if (aYear !== bYear) return aYear - bYear;
    return aMonth - bMonth;
};

const sortPeriodKeys = (a: string, b: string, cycle: SettlementCycle, direction: 'asc' | 'desc') => {
    const asc = comparePeriodKeysAsc(a, b, cycle);
    return direction === 'asc' ? asc : -asc;
};

const getOrderPaidAmount = (order: Order) => {
    const commission = Math.max(0, Number(order.commissionAmount || 0));
    const paidByAmount = Math.max(0, Number(order.commissionPaidAmount || 0));
    const paidFromLegacyStatus = order.commissionStatus === 'PAID' && paidByAmount <= 0 ? commission : 0;
    return Math.min(commission, paidByAmount + paidFromLegacyStatus);
};

const getSummaryStatus = (paid: number, outstanding: number): CommissionStatus => {
    if (outstanding <= 0) return 'PAID';
    if (paid > 0) return 'PARTIAL';
    return 'PENDING';
};

const buildPeriodSummaries = (orders: Order[], cycle: SettlementCycle): PeriodSummary[] => {
    const map: Record<string, Omit<PeriodSummary, 'status'>> = {};

    orders.forEach((order) => {
        if (!isCompletedOrderStatus(order.status)) return;
        const periodKey = getPeriodKeyFromOrder(order, cycle);
        if (!periodKey) return;

        if (!map[periodKey]) {
            map[periodKey] = {
                periodKey,
                ordersCount: 0,
                commission: 0,
                paid: 0,
                outstanding: 0
            };
        }

        const commission = Math.max(0, Number(order.commissionAmount || 0));
        const paid = getOrderPaidAmount(order);
        const outstanding = Math.max(0, commission - paid);

        map[periodKey].ordersCount += 1;
        map[periodKey].commission += commission;
        map[periodKey].paid += paid;
        map[periodKey].outstanding += outstanding;
    });

    return Object.values(map)
        .map((summary) => ({
            ...summary,
            status: getSummaryStatus(summary.paid, summary.outstanding)
        }))
        .sort((a, b) => sortPeriodKeys(a.periodKey, b.periodKey, cycle, 'desc'));
};

const buildPendingByPharmacy = (orders: Order[], cycle: SettlementCycle): Record<string, PeriodSummary[]> => {
    const grouped: Record<string, Record<string, Omit<PeriodSummary, 'status'>>> = {};

    orders.forEach((order) => {
        if (!order.pharmacyId) return;
        if (!isCompletedOrderStatus(order.status)) return;
        const periodKey = getPeriodKeyFromOrder(order, cycle);
        if (!periodKey) return;

        if (!grouped[order.pharmacyId]) grouped[order.pharmacyId] = {};
        if (!grouped[order.pharmacyId][periodKey]) {
            grouped[order.pharmacyId][periodKey] = {
                periodKey,
                ordersCount: 0,
                commission: 0,
                paid: 0,
                outstanding: 0
            };
        }

        const commission = Math.max(0, Number(order.commissionAmount || 0));
        const paid = getOrderPaidAmount(order);
        const outstanding = Math.max(0, commission - paid);

        grouped[order.pharmacyId][periodKey].ordersCount += 1;
        grouped[order.pharmacyId][periodKey].commission += commission;
        grouped[order.pharmacyId][periodKey].paid += paid;
        grouped[order.pharmacyId][periodKey].outstanding += outstanding;
    });

    const result: Record<string, PeriodSummary[]> = {};
    Object.entries(grouped).forEach(([pharmacyId, periodMap]) => {
        result[pharmacyId] = Object.values(periodMap)
            .map((summary) => ({
                ...summary,
                status: getSummaryStatus(summary.paid, summary.outstanding)
            }))
            .filter((summary) => summary.outstanding > 0)
            .sort((a, b) => sortPeriodKeys(a.periodKey, b.periodKey, cycle, 'asc'));
    });
    return result;
};

const money = (value: number) => `Kz ${Math.round(value || 0).toLocaleString()}`;

const badgeColorByStatus = (status: CommissionStatus): 'green' | 'yellow' | 'red' => {
    if (status === 'PAID') return 'green';
    if (status === 'PARTIAL') return 'yellow';
    return 'red';
};

const statusLabel = (status: CommissionStatus) => {
    if (status === 'PAID') return 'LIQUIDADO';
    if (status === 'PARTIAL') return 'PARCIAL';
    return 'PENDENTE';
};

const shortId = (id?: string | null) => {
    if (!id) return '-';
    if (id.length <= 10) return id;
    return `${id.slice(0, 8)}...`;
};
const LedgerTable = ({
    entries,
    pharmacyNameById
}: {
    entries: FinancialLedgerEntry[];
    pharmacyNameById?: Record<string, string>;
}) => {
    if (!entries.length) {
        return (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                <p className="text-base font-semibold text-gray-500">Sem eventos no ledger.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm min-w-[980px]">
                <thead className="bg-gradient-to-r from-slate-50 to-emerald-50 text-[11px] uppercase font-black text-gray-600 tracking-wider">
                    <tr>
                        <th className="px-5 py-4 text-left">Data</th>
                        <th className="px-5 py-4 text-left">Operacao</th>
                        <th className="px-5 py-4 text-left">Farmacia</th>
                        <th className="px-5 py-4 text-left">Periodo</th>
                        <th className="px-5 py-4 text-right">Aplicado</th>
                        <th className="px-5 py-4 text-right">Antes</th>
                        <th className="px-5 py-4 text-right">Depois</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {entries.map((entry) => {
                        const pharmacyLabel = entry.pharmacyId
                            ? (pharmacyNameById?.[entry.pharmacyId] || shortId(entry.pharmacyId))
                            : '-';
                        const operationLabel = entry.operationType === 'RESET' ? 'RESET' : 'LIQUIDACAO';
                        return (
                            <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-5 py-4 font-semibold text-gray-700">{new Date(entry.createdAt).toLocaleString('pt-AO')}</td>
                                <td className="px-5 py-4">
                                    <Badge color={entry.operationType === 'RESET' ? 'red' : 'blue'} className="text-[11px] font-black px-3 py-1">
                                        {operationLabel}
                                    </Badge>
                                </td>
                                <td className="px-5 py-4 text-gray-700 font-semibold">{pharmacyLabel}</td>
                                <td className="px-5 py-4 text-gray-700 font-semibold">
                                    <p>{entry.periodKey || '-'}</p>
                                    {entry.note && <p className="text-xs font-medium text-gray-400 mt-1 max-w-[260px] truncate">{entry.note}</p>}
                                </td>
                                <td className="px-5 py-4 text-right font-black text-emerald-700">{money(entry.appliedAmount)}</td>
                                <td className="px-5 py-4 text-right text-gray-500 font-semibold">{money(entry.beforePaidAmount)}</td>
                                <td className="px-5 py-4 text-right text-gray-800 font-semibold">{money(entry.afterPaidAmount)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const PeriodList = ({ periods }: { periods: PeriodSummary[] }) => {
    if (!periods.length) {
        return <p className="text-sm text-gray-400 italic">Sem periodos neste ciclo.</p>;
    }

    return (
        <div className="divide-y divide-gray-100">
            {periods.map((summary) => (
                <div key={summary.periodKey} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                    <div className="flex items-start gap-3">
                        <Calendar size={16} className="text-emerald-600 mt-0.5" />
                        <div>
                            <p className="text-sm font-black text-gray-800">{summary.periodKey}</p>
                            <p className="text-xs text-gray-500">Pedidos: {summary.ordersCount}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge color="gray">Comissao {money(summary.commission)}</Badge>
                        <Badge color="green">Pago {money(summary.paid)}</Badge>
                        <Badge color={summary.outstanding > 0 ? 'red' : 'green'}>Aberto {money(summary.outstanding)}</Badge>
                        <Badge color={badgeColorByStatus(summary.status)}>{statusLabel(summary.status)}</Badge>
                    </div>
                </div>
            ))}
        </div>
    );
};

export const PharmacyFinancialView = ({ pharmacyId }: { pharmacyId: string }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [cycle, setCycle] = useState<SettlementCycle>(DEFAULT_FINANCIAL_SETTLEMENT_CYCLE);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [orderData, cycleData, ledgerData] = await Promise.all([
                fetchOrders(pharmacyId),
                fetchFinancialSettlementCycle(),
                fetchFinancialLedgerEntries({ pharmacyId, limit: 120 })
            ]);
            setOrders(orderData || []);
            setCycle(cycleData);
            setLedger(ledgerData || []);
        } catch {
            setToast({ msg: 'Falha ao carregar dados financeiros.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [pharmacyId]);

    const periodSummaries = useMemo(() => buildPeriodSummaries(orders, cycle), [orders, cycle]);
    const pendingPeriods = useMemo(() => periodSummaries.filter((p) => p.outstanding > 0), [periodSummaries]);
    const totalOutstanding = useMemo(
        () => pendingPeriods.reduce((acc, period) => acc + period.outstanding, 0),
        [pendingPeriods]
    );
    const currentPeriodKey = useMemo(() => getPeriodKeyFromDate(new Date(), cycle) || '-', [cycle]);
    const currentPeriodOutstanding = useMemo(() => {
        const summary = periodSummaries.find((p) => p.periodKey === currentPeriodKey);
        return summary?.outstanding || 0;
    }, [periodSummaries, currentPeriodKey]);

    if (loading) {
        return (
            <div className="p-20 flex justify-center">
                <Loader2 className="animate-spin text-emerald-600" size={36} />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <Wallet className="text-emerald-600" />
                        Financeiro Sequencial
                    </h1>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
                        Ciclo {cycle === 'WEEKLY' ? 'SEMANAL' : 'MENSAL'} | Estado real por periodo
                    </p>
                </div>
                <Button variant="outline" onClick={load}>
                    <RefreshCw size={14} className="mr-2" />
                    Atualizar
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Periodo Ativo</p>
                    <p className="text-xl font-black text-gray-900 mt-1">{currentPeriodKey}</p>
                </Card>
                <Card className="border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Em Aberto no Periodo Ativo</p>
                    <p className="text-2xl font-black text-amber-600 mt-1">{money(currentPeriodOutstanding)}</p>
                </Card>
                <Card className="border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Total em Aberto</p>
                    <p className="text-2xl font-black text-red-600 mt-1">{money(totalOutstanding)}</p>
                </Card>
            </div>

            <Card className="border border-gray-100">
                <h3 className="font-black text-gray-700 uppercase text-xs tracking-wider mb-3">Pendencias por Periodo</h3>
                <PeriodList periods={pendingPeriods} />
            </Card>

            <Card className="border border-gray-100">
                <h3 className="font-black text-gray-700 uppercase text-xs tracking-wider mb-3">Historico por Periodo</h3>
                <PeriodList periods={periodSummaries} />
            </Card>

            <Card className="border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs uppercase font-black text-gray-700 tracking-wider flex items-center gap-2">
                        <Activity size={14} />
                        Ledger de Auditoria
                    </h3>
                    <Badge color="gray">{ledger.length} eventos</Badge>
                </div>
                <LedgerTable entries={ledger} />
            </Card>
        </div>
    );
};
export const AdminFinancialView = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [cycle, setCycle] = useState<SettlementCycle>(DEFAULT_FINANCIAL_SETTLEMENT_CYCLE);
    const [loading, setLoading] = useState(true);
    const [savingCycle, setSavingCycle] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
    const [selectedPeriodKey, setSelectedPeriodKey] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const [allOrders, allPharmacies, cycleData, ledgerData] = await Promise.all([
                fetchOrders(),
                fetchPharmacies(true),
                fetchFinancialSettlementCycle(),
                fetchFinancialLedgerEntries({ limit: 300 })
            ]);

            setOrders(allOrders || []);
            setPharmacies((allPharmacies || []).map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)));
            setCycle(cycleData);
            setLedger(ledgerData || []);
        } catch {
            setToast({ msg: 'Falha ao carregar financeiro.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const pendingByPharmacy = useMemo(() => buildPendingByPharmacy(orders, cycle), [orders, cycle]);

    const outstandingByPharmacy = useMemo(() => {
        const totals: Record<string, number> = {};
        Object.entries(pendingByPharmacy).forEach(([pharmacyId, summaries]) => {
            totals[pharmacyId] = summaries.reduce((acc, summary) => acc + summary.outstanding, 0);
        });
        return totals;
    }, [pendingByPharmacy]);

    const sortedPharmacies = useMemo(() => {
        const next = [...pharmacies];
        next.sort((a, b) => {
            const diff = (outstandingByPharmacy[b.id] || 0) - (outstandingByPharmacy[a.id] || 0);
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });
        return next;
    }, [pharmacies, outstandingByPharmacy]);

    useEffect(() => {
        if (!sortedPharmacies.length) {
            if (selectedPharmacyId) setSelectedPharmacyId('');
            return;
        }

        const exists = sortedPharmacies.some((p) => p.id === selectedPharmacyId);
        if (exists) return;

        const firstWithDebt = sortedPharmacies.find((p) => (outstandingByPharmacy[p.id] || 0) > 0);
        setSelectedPharmacyId((firstWithDebt || sortedPharmacies[0]).id);
    }, [sortedPharmacies, selectedPharmacyId, outstandingByPharmacy]);

    const selectedPharmacyPeriods = useMemo(
        () => pendingByPharmacy[selectedPharmacyId] || [],
        [pendingByPharmacy, selectedPharmacyId]
    );

    useEffect(() => {
        if (!selectedPharmacyPeriods.length) {
            if (selectedPeriodKey) setSelectedPeriodKey('');
            return;
        }
        if (!selectedPharmacyPeriods.some((period) => period.periodKey === selectedPeriodKey)) {
            setSelectedPeriodKey(selectedPharmacyPeriods[0].periodKey);
        }
    }, [selectedPharmacyPeriods, selectedPeriodKey]);

    const selectedPeriodSummary = useMemo(
        () => selectedPharmacyPeriods.find((period) => period.periodKey === selectedPeriodKey) || null,
        [selectedPharmacyPeriods, selectedPeriodKey]
    );

    const pharmaciesWithDebtCount = useMemo(
        () => sortedPharmacies.filter((pharmacy) => (outstandingByPharmacy[pharmacy.id] || 0) > 0).length,
        [sortedPharmacies, outstandingByPharmacy]
    );

    const selectedPharmacyOutstanding = outstandingByPharmacy[selectedPharmacyId] || 0;

    const pharmacyNameById = useMemo(() => {
        return Object.fromEntries(pharmacies.map((p) => [p.id, p.name]));
    }, [pharmacies]);

    const ledgerSettlementCount = useMemo(
        () => ledger.filter((entry) => entry.operationType === 'SETTLEMENT').length,
        [ledger]
    );

    const ledgerResetCount = useMemo(
        () => ledger.filter((entry) => entry.operationType === 'RESET').length,
        [ledger]
    );

    const handleSaveCycle = async () => {
        setSavingCycle(true);
        const ok = await saveFinancialSettlementCycle(cycle);
        setSavingCycle(false);
        if (!ok) {
            setToast({ msg: 'Falha ao salvar ciclo financeiro.', type: 'error' });
            return;
        }
        setToast({ msg: `Ciclo salvo: ${cycle === 'WEEKLY' ? 'semanal' : 'mensal'}.`, type: 'success' });
        await load();
    };

    const settleSinglePeriod = async (periodKey: string) => {
        if (!selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmacia.', type: 'error' });
            return;
        }

        setActionLoading(true);
        try {
            const result = await applyCommissionPaymentByPeriodByAdmin(selectedPharmacyId, periodKey, cycle);
            if (!result.success) {
                setToast({ msg: result.error || 'Falha na liquidacao.', type: 'error' });
                return;
            }

            playSound('cash');
            setToast({
                msg: `Liquidacao concluida em ${periodKey}. Pedidos: ${result.updatedCount}. Aplicado: ${money(result.appliedAmount)}.`,
                type: 'success'
            });
            await load();
        } finally {
            setActionLoading(false);
        }
    };

    const handleSettleSelected = async () => {
        if (!selectedPeriodKey) {
            setToast({ msg: 'Selecione um periodo pendente.', type: 'error' });
            return;
        }
        await settleSinglePeriod(selectedPeriodKey);
    };

    const handleSettleAllSequential = async () => {
        if (!selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmacia.', type: 'error' });
            return;
        }
        if (!selectedPharmacyPeriods.length) {
            setToast({ msg: 'Nao ha periodos pendentes para esta farmacia.', type: 'info' });
            return;
        }

        setActionLoading(true);
        let applied = 0;
        let updated = 0;

        try {
            for (const period of selectedPharmacyPeriods) {
                const result = await applyCommissionPaymentByPeriodByAdmin(selectedPharmacyId, period.periodKey, cycle);
                if (!result.success) {
                    setToast({
                        msg: `Falha na liquidacao do periodo ${period.periodKey}: ${result.error || 'erro desconhecido'}.`,
                        type: 'error'
                    });
                    return;
                }
                applied += result.appliedAmount;
                updated += result.updatedCount;
            }

            playSound('cash');
            setToast({
                msg: `Liquidacao sequencial concluida. Pedidos: ${updated}. Aplicado: ${money(applied)}.`,
                type: 'success'
            });
            await load();
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-20 flex justify-center">
                <Loader2 className="animate-spin text-blue-600" size={36} />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <Wallet className="text-blue-600" />
                        Centro Financeiro Sequencial
                    </h1>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-1">
                        Fluxo unico: farmacia -&gt; periodo -&gt; liquidacao
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={load}
                    disabled={actionLoading || savingCycle}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                    <RefreshCw size={14} className="mr-2" />
                    Atualizar
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 via-white to-blue-100">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] font-black text-blue-700">Farmacias com Pendencia</p>
                            <p className="text-4xl font-black text-blue-950 mt-3 leading-none">{pharmaciesWithDebtCount}</p>
                            <p className="text-sm font-semibold text-blue-700 mt-3">Comissao em aberto para acompanhamento</p>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow">
                            <Building2 size={24} />
                        </div>
                    </div>
                </Card>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 via-white to-rose-100">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] font-black text-red-700">Pendencia da Farmacia Selecionada</p>
                            <p className="text-4xl font-black text-red-700 mt-3 leading-none">{money(selectedPharmacyOutstanding)}</p>
                            <p className="text-sm font-semibold text-red-700 mt-3">Valor aberto no momento da selecao</p>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow">
                            <AlertTriangle size={24} />
                        </div>
                    </div>
                </Card>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 via-white to-teal-100">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] font-black text-emerald-700">Eventos Ledger</p>
                            <p className="text-4xl font-black text-emerald-700 mt-3 leading-none">{ledger.length}</p>
                            <p className="text-sm font-semibold text-emerald-700 mt-3">{ledgerSettlementCount} liquidacoes | {ledgerResetCount} resets</p>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow">
                            <Landmark size={24} />
                        </div>
                    </div>
                </Card>
            </div>

            <Card className="border border-blue-100 shadow-sm bg-gradient-to-br from-blue-50/60 via-white to-blue-100/40">
                <h3 className="text-sm uppercase font-black text-blue-900 tracking-wider flex items-center gap-2 mb-3">
                    <Settings2 size={16} />
                    1. Configuracao de Ciclo
                </h3>
                <p className="text-sm text-blue-800 font-medium mb-4">
                    Defina a periodicidade de liquidacao para todo o sistema financeiro.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={cycle}
                        onChange={(e) => setCycle(e.target.value as SettlementCycle)}
                        className="h-11 px-4 rounded-xl border border-blue-200 text-base font-semibold bg-white text-blue-950"
                        disabled={savingCycle || actionLoading}
                    >
                        <option value="MONTHLY">Mensal</option>
                        <option value="WEEKLY">Semanal</option>
                    </select>
                    <Button
                        variant="outline"
                        onClick={handleSaveCycle}
                        disabled={savingCycle || actionLoading}
                        className="border-blue-500 text-blue-700 hover:bg-blue-100"
                    >
                        {savingCycle ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Clock3 size={14} className="mr-2" />}
                        Salvar Ciclo
                    </Button>
                </div>
            </Card>

            <Card className="border border-slate-200 shadow-sm bg-white">
                <h3 className="text-sm uppercase font-black text-slate-900 tracking-wider mb-3 flex items-center gap-2">
                    <Building2 size={16} className="text-slate-700" />
                    2. Selecionar Farmacia
                </h3>
                <p className="text-sm text-slate-600 font-medium mb-4">
                    A lista e ordenada por maior pendencia para acelerar a liquidacao.
                </p>
                <select
                    value={selectedPharmacyId}
                    onChange={(e) => setSelectedPharmacyId(e.target.value)}
                    className="h-12 px-4 rounded-xl border border-slate-300 text-base font-semibold w-full lg:w-[520px] bg-slate-50"
                    disabled={actionLoading}
                >
                    {sortedPharmacies.length === 0 && <option value="">Sem farmacias</option>}
                    {sortedPharmacies.map((pharmacy) => (
                        <option key={pharmacy.id} value={pharmacy.id}>
                            {pharmacy.name} | aberto {money(outstandingByPharmacy[pharmacy.id] || 0)}
                        </option>
                    ))}
                </select>
                {selectedPharmacyId && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Badge color="red" className="text-sm font-bold px-3 py-1">
                            Em aberto: {money(selectedPharmacyOutstanding)}
                        </Badge>
                        <Badge color="gray" className="text-sm font-bold px-3 py-1">
                            Periodos pendentes: {selectedPharmacyPeriods.length}
                        </Badge>
                    </div>
                )}
            </Card>

            <Card className="border border-amber-100 shadow-sm bg-gradient-to-br from-amber-50/50 via-white to-orange-50/60">
                <h3 className="text-sm uppercase font-black text-amber-900 tracking-wider mb-3">3. Selecionar Periodo (ordem antiga -&gt; nova)</h3>
                <p className="text-sm text-amber-800 font-medium mb-4">
                    Escolha o periodo para liquidar. O fluxo segue a ordem cronologica para manter previsibilidade.
                </p>
                {!selectedPharmacyId ? (
                    <p className="text-sm text-gray-400 italic">Selecione uma farmacia para carregar periodos.</p>
                ) : !selectedPharmacyPeriods.length ? (
                    <p className="text-sm text-gray-400 italic">Esta farmacia nao possui pendencias.</p>
                ) : (
                    <div className="space-y-2">
                        {selectedPharmacyPeriods.map((period) => {
                            const checked = period.periodKey === selectedPeriodKey;
                            return (
                                <label
                                    key={period.periodKey}
                                    className={`flex items-center justify-between gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                                        checked
                                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="radio"
                                            name="selected-period"
                                            checked={checked}
                                            onChange={() => setSelectedPeriodKey(period.periodKey)}
                                            disabled={actionLoading}
                                        />
                                        <span className="font-black text-lg text-gray-800">{period.periodKey}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge color="gray" className="text-sm font-bold px-3 py-1">{period.ordersCount} pedidos</Badge>
                                        <Badge color="red" className="text-sm font-bold px-3 py-1">Aberto {money(period.outstanding)}</Badge>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}
            </Card>

            <Card className="border border-emerald-100 shadow-sm bg-gradient-to-br from-emerald-50/70 via-white to-cyan-50/50">
                <h3 className="text-sm uppercase font-black text-emerald-900 tracking-wider mb-3">4. Liquidacao</h3>
                <p className="text-sm text-emerald-800 font-medium mb-4">
                    Execute o pagamento do periodo selecionado ou processe todos os periodos pendentes da farmacia.
                </p>
                <div className="flex flex-wrap gap-3">
                    <Button
                        onClick={handleSettleSelected}
                        disabled={actionLoading || !selectedPeriodSummary}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-3"
                    >
                        {actionLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Wallet size={14} className="mr-2" />}
                        Liquidar Periodo Selecionado
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleSettleAllSequential}
                        disabled={actionLoading || !selectedPharmacyPeriods.length}
                        className="border-emerald-500 text-emerald-700 hover:bg-emerald-100 text-sm font-bold px-5 py-3"
                    >
                        <Clock3 size={14} className="mr-2" />
                        Liquidar Tudo em Sequencia
                    </Button>
                </div>
                {selectedPeriodSummary && (
                    <p className="text-sm text-emerald-900 mt-4 font-semibold">
                        Selecionado: {selectedPeriodSummary.periodKey} | Comissao {money(selectedPeriodSummary.commission)} | Em aberto {money(selectedPeriodSummary.outstanding)}
                    </p>
                )}
            </Card>

            <Card className="border border-slate-200 shadow-sm bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h3 className="text-sm uppercase font-black text-slate-900 tracking-wider flex items-center gap-2">
                        <Activity size={16} className="text-slate-700" />
                        Ledger Financeiro
                    </h3>
                    <div className="flex items-center gap-2">
                        <Badge color="blue" className="text-sm font-bold px-3 py-1">{ledgerSettlementCount} liquidacoes</Badge>
                        <Badge color="red" className="text-sm font-bold px-3 py-1">{ledgerResetCount} resets</Badge>
                    </div>
                </div>
                <LedgerTable entries={ledger} pharmacyNameById={pharmacyNameById} />
            </Card>

            <Card className="border border-gray-100 bg-gray-900 text-white">
                <div className="flex items-start gap-3">
                    <ShieldCheck className="text-emerald-400 mt-0.5" size={20} />
                    <div>
                        <p className="font-black">Fluxo Controlado</p>
                        <p className="text-sm text-gray-300 mt-1">
                            O painel trabalha por passos e evita operacoes paralelas. Cada liquidacao recarrega o estado do banco antes da proxima acao.
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
};

