import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Toast } from '../components/UI';
import { CommissionStatus, Order, PharmacyFinancials, SettlementCycle } from '../types';
import {
    applyCommissionPaymentByPeriodByAdmin,
    DEFAULT_FINANCIAL_SETTLEMENT_CYCLE,
    fetchFinancialLedgerEntries,
    fetchFinancialReport,
    fetchFinancialSettlementCycle,
    FinancialLedgerEntry,
    getCachedFinancialReport,
    resetCommissionDebtByAdmin,
    saveFinancialSettlementCycle,
    setCachedFinancialReport
} from '../services/dataService';
import { fetchOrders } from '../services/orderService';
import {
    Activity,
    AlertCircle,
    BarChart3,
    Calendar,
    CheckCircle2,
    Clock3,
    Download,
    Filter,
    Loader2,
    RefreshCw,
    RotateCcw,
    Settings2,
    ShieldCheck,
    TrendingUp,
    Wallet
} from 'lucide-react';
import { playSound } from '../services/soundService';

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

const getPeriodKeyFromOrder = (order: Order, cycle: SettlementCycle): string | null => {
    const sourceDate = order.createdAt ? new Date(order.createdAt) : new Date(order.date);
    if (Number.isNaN(sourceDate.getTime())) return null;
    if (cycle === 'WEEKLY') {
        const d = new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate()));
        const { week, year } = getIsoWeek(d);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }
    return `${String(sourceDate.getMonth() + 1).padStart(2, '0')}/${sourceDate.getFullYear()}`;
};

const sortPeriodKeysDesc = (a: string, b: string, cycle: SettlementCycle) => {
    if (cycle === 'WEEKLY') {
        const [ay, aw] = a.split('-W').map(Number);
        const [by, bw] = b.split('-W').map(Number);
        if (ay !== by) return by - ay;
        return bw - aw;
    }
    const [am, ay] = a.split('/').map(Number);
    const [bm, by] = b.split('/').map(Number);
    if (ay !== by) return by - ay;
    return bm - am;
};

const getOrderPaidAmount = (order: Order) => {
    const commission = Number(order.commissionAmount || 0);
    const paidByAmount = Number(order.commissionPaidAmount || 0);
    const paidFromLegacyStatus = order.commissionStatus === 'PAID' && paidByAmount <= 0 ? commission : 0;
    return Math.min(commission, Math.max(0, paidByAmount + paidFromLegacyStatus));
};

const getOrderOutstandingAmount = (order: Order) => {
    const commission = Number(order.commissionAmount || 0);
    return Math.max(0, commission - getOrderPaidAmount(order));
};

const money = (value: number) => `Kz ${Math.round(value || 0).toLocaleString()}`;

const exportCsv = (filename: string, rows: Array<Record<string, string | number | null>>) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvLines = [
        headers.join(','),
        ...rows.map((row) =>
            headers
                .map((h) => {
                    const raw = row[h];
                    const value = raw === null || raw === undefined ? '' : String(raw);
                    const escaped = value.replace(/"/g, '""');
                    return `"${escaped}"`;
                })
                .join(',')
        )
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const LedgerTable = ({ entries }: { entries: FinancialLedgerEntry[] }) => {
    if (!entries.length) {
        return <div className="p-8 text-sm text-gray-400 italic text-center">Sem eventos no ledger.</div>;
    }
    return (
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[920px]">
                <thead className="bg-gray-50 text-[10px] uppercase font-black text-gray-500 tracking-wider">
                    <tr>
                        <th className="p-4 text-left">Data</th>
                        <th className="p-4 text-left">Operação</th>
                        <th className="p-4 text-left">Período</th>
                        <th className="p-4 text-right">Aplicado</th>
                        <th className="p-4 text-right">Antes</th>
                        <th className="p-4 text-right">Depois</th>
                        <th className="p-4 text-left">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="p-4 font-semibold text-gray-700">{new Date(entry.createdAt).toLocaleString('pt-AO')}</td>
                            <td className="p-4">
                                <Badge color={entry.operationType === 'RESET' ? 'red' : 'blue'}>
                                    {entry.operationType === 'RESET' ? 'RESET' : 'LIQUIDAÇÃO'}
                                </Badge>
                            </td>
                            <td className="p-4 text-gray-600 font-semibold">{entry.periodKey || '-'}</td>
                            <td className="p-4 text-right font-black text-emerald-700">{money(entry.appliedAmount)}</td>
                            <td className="p-4 text-right text-gray-500">{money(entry.beforePaidAmount)}</td>
                            <td className="p-4 text-right text-gray-800 font-semibold">{money(entry.afterPaidAmount)}</td>
                            <td className="p-4 text-xs font-bold text-gray-600">{entry.beforeStatus || '-'} → {entry.afterStatus || '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const PharmacyFinancialView = ({ pharmacyId }: { pharmacyId: string }) => {
    const [data, setData] = useState<PharmacyFinancials | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [cycle, setCycle] = useState<SettlementCycle>(DEFAULT_FINANCIAL_SETTLEMENT_CYCLE);
    const [loading, setLoading] = useState(true);

    const load = async (useCache = false) => {
        setLoading(true);
        try {
            let reportData = useCache ? getCachedFinancialReport() : null;
            if (!reportData) {
                reportData = await fetchFinancialReport();
                setCachedFinancialReport(reportData || []);
            }

            const [oData, cycleData, ledgerData] = await Promise.all([
                fetchOrders(pharmacyId),
                fetchFinancialSettlementCycle(),
                fetchFinancialLedgerEntries({ pharmacyId, limit: 80 })
            ]);

            const myStats = (reportData || []).find((r: any) => r.id === pharmacyId);
            setData(myStats || null);
            setOrders((oData || []).filter((o) => isCompletedOrderStatus(o.status)));
            setCycle(cycleData);
            setLedger(ledgerData);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(true);
    }, [pharmacyId]);

    const periodStats = useMemo(() => {
        const groups: Record<string, { sales: number; fees: number; status: CommissionStatus }> = {};
        orders.forEach((o) => {
            const key = getPeriodKeyFromOrder(o, cycle);
            if (!key) return;
            if (!groups[key]) groups[key] = { sales: 0, fees: 0, status: 'PAID' };
            groups[key].sales += o.total;
            groups[key].fees += o.commissionAmount || 0;
            if (getOrderOutstandingAmount(o) > 0) groups[key].status = 'PENDING';
        });
        return Object.entries(groups).sort((a, b) => sortPeriodKeysDesc(a[0], b[0], cycle));
    }, [orders, cycle]);

    if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-emerald-600" size={36} /></div>;
    if (!data) return <div className="p-20 text-center text-gray-400 italic">Sem dados financeiros para esta farmácia.</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3"><Wallet className="text-emerald-600" /> Financial Hub</h1>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Performance, liquidação e auditoria ({cycle === 'WEEKLY' ? 'Semanal' : 'Mensal'})</p>
                </div>
                <Button variant="outline" onClick={() => load(false)}><RefreshCw size={14} className="mr-2" /> Atualizar</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-5 border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Faturamento</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{money(data.stats.totalSales)}</p>
                </Card>
                <Card className="p-5 border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Comissão Total</p>
                    <p className="text-2xl font-black text-red-600 mt-1">{money(data.stats.platformFees)}</p>
                </Card>
                <Card className="p-5 border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Pago</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{money(data.stats.paidFees)}</p>
                </Card>
                <Card className="p-5 border border-gray-100">
                    <p className="text-[10px] uppercase font-black text-gray-400">Em Aberto</p>
                    <p className="text-2xl font-black text-amber-600 mt-1">{money(data.stats.unpaidFees)}</p>
                </Card>
            </div>

            <Card className="p-0 overflow-hidden border border-gray-100">
                <div className="p-5 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="font-black text-gray-700 uppercase text-xs tracking-wider">Resumo por Período</h3>
                    <Badge color="gray">Comissão {data.commissionRate}%</Badge>
                </div>
                <div className="divide-y divide-gray-100">
                    {periodStats.length === 0 ? (
                        <div className="p-8 text-sm text-gray-400 italic text-center">Sem períodos fechados ainda.</div>
                    ) : (
                        periodStats.map(([period, stats]) => (
                            <div key={period} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-2">
                                <div className="flex items-center gap-3">
                                    <Calendar size={16} className="text-emerald-600" />
                                    <div>
                                        <p className="text-sm font-black text-gray-800">{period}</p>
                                        <p className="text-xs text-gray-500">Venda: {money(stats.sales)} • Comissão: {money(stats.fees)}</p>
                                    </div>
                                </div>
                                <Badge color={stats.status === 'PAID' ? 'green' : 'red'}>
                                    {stats.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}
                                </Badge>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            <Card className="p-0 overflow-hidden border border-gray-100">
                <div className="p-5 border-b bg-gray-50">
                    <h3 className="font-black text-gray-700 uppercase text-xs tracking-wider">Ledger (Auditoria)</h3>
                </div>
                <LedgerTable entries={ledger} />
            </Card>
        </div>
    );
};

export const AdminFinancialView = () => {
    const [report, setReport] = useState<PharmacyFinancials[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [cycle, setCycle] = useState<SettlementCycle>(DEFAULT_FINANCIAL_SETTLEMENT_CYCLE);
    const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingCycle, setSavingCycle] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
    const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
    const [partialAmount, setPartialAmount] = useState('');
    const [showOps, setShowOps] = useState(true);

    const load = async (useCache = false) => {
        setLoading(true);
        try {
            let reportData = useCache ? getCachedFinancialReport() : null;
            if (!reportData) {
                reportData = await fetchFinancialReport();
                setCachedFinancialReport(reportData || []);
            }

            const [allOrders, cycleData, ledgerData] = await Promise.all([
                fetchOrders(),
                fetchFinancialSettlementCycle(),
                fetchFinancialLedgerEntries({ limit: 300 })
            ]);

            setReport(reportData || []);
            setOrders((allOrders || []).filter((o) => isCompletedOrderStatus(o.status)));
            setCycle(cycleData);
            setLedger(ledgerData);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(true);
    }, []);

    const pendingByPharmacyAndPeriod = useMemo(() => {
        const map: Record<string, Record<string, number>> = {};
        orders.forEach((order) => {
            if (!order.pharmacyId) return;
            const key = getPeriodKeyFromOrder(order, cycle);
            if (!key) return;
            const outstanding = getOrderOutstandingAmount(order);
            if (outstanding <= 0) return;
            if (!map[order.pharmacyId]) map[order.pharmacyId] = {};
            map[order.pharmacyId][key] = (map[order.pharmacyId][key] || 0) + outstanding;
        });
        return map;
    }, [orders, cycle]);

    const selectedPharmacyPeriods = useMemo(() => {
        if (!selectedPharmacyId) return [];
        const values = pendingByPharmacyAndPeriod[selectedPharmacyId] || {};
        return Object.entries(values)
            .sort((a, b) => sortPeriodKeysDesc(a[0], b[0], cycle))
            .map(([period, amount]) => ({ period, amount }));
    }, [pendingByPharmacyAndPeriod, selectedPharmacyId, cycle]);

    const selectedPeriodsTotal = useMemo(
        () =>
            selectedPeriods.reduce((acc, period) => {
                const amount = pendingByPharmacyAndPeriod[selectedPharmacyId]?.[period] || 0;
                return acc + amount;
            }, 0),
        [selectedPeriods, pendingByPharmacyAndPeriod, selectedPharmacyId]
    );

    const totalGlobalSales = report.reduce((acc, r) => acc + r.stats.totalSales, 0);
    const totalGlobalFees = report.reduce((acc, r) => acc + r.stats.platformFees, 0);
    const totalFeesUnpaid = report.reduce((acc, r) => acc + r.stats.unpaidFees, 0);

    const handleSaveCycle = async () => {
        setSavingCycle(true);
        const ok = await saveFinancialSettlementCycle(cycle);
        setSavingCycle(false);
        setToast({
            msg: ok ? `Periodicidade alterada para ${cycle === 'WEEKLY' ? 'semanal' : 'mensal'}.` : 'Falha ao salvar periodicidade.',
            type: ok ? 'success' : 'error'
        });
    };

    const settlePeriods = async (pharmacyId: string, periods: string[], amount?: number) => {
        if (!periods.length) return;
        setActionLoading(pharmacyId);
        let remaining = amount && amount > 0 ? amount : undefined;
        let applied = 0;
        let updated = 0;

        for (const periodKey of periods) {
            const result = await applyCommissionPaymentByPeriodByAdmin(pharmacyId, periodKey, cycle, remaining);
            if (!result.success) {
                setToast({ msg: result.error || 'Falha na liquidação.', type: 'error' });
                setActionLoading(null);
                return;
            }
            applied += result.appliedAmount;
            updated += result.updatedCount;
            if (remaining !== undefined) remaining = result.remainingAmount;
            if (remaining !== undefined && remaining <= 0) break;
        }

        setActionLoading(null);
        playSound('cash');
        setToast({
            msg: `Liquidação concluída. Pedidos atualizados: ${updated}. Valor aplicado: ${money(applied)}.`,
            type: 'success'
        });
        await load(false);
    };

    const handleSettleSelected = async () => {
        if (!selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmácia.', type: 'error' });
            return;
        }
        if (!selectedPeriods.length) {
            setToast({ msg: 'Selecione pelo menos um período.', type: 'error' });
            return;
        }
        const amount = Number(partialAmount);
        const hasPartial = Number.isFinite(amount) && amount > 0;
        await settlePeriods(selectedPharmacyId, [...selectedPeriods].sort((a, b) => sortPeriodKeysDesc(a, b, cycle)), hasPartial ? amount : undefined);
    };

    const handleResetDebt = async (all: boolean) => {
        if (!all && !selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmácia para reset.', type: 'error' });
            return;
        }
        const result = await resetCommissionDebtByAdmin(all ? undefined : selectedPharmacyId);
        if (!result.success) {
            setToast({ msg: result.error || 'Falha ao resetar.', type: 'error' });
            return;
        }
        setToast({ msg: `Reset concluído (${result.updatedCount} pedidos).`, type: 'success' });
        await load(false);
    };

    const exportLedgerCsv = () => {
        exportCsv(
            `financial-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
            ledger.map((e) => ({
                created_at: e.createdAt,
                operation_type: e.operationType,
                pharmacy_id: e.pharmacyId,
                order_id: e.orderId,
                period_key: e.periodKey,
                cycle: e.cycle,
                applied_amount: e.appliedAmount,
                before_paid_amount: e.beforePaidAmount,
                after_paid_amount: e.afterPaidAmount,
                before_status: e.beforeStatus,
                after_status: e.afterStatus,
                created_by: e.createdBy,
                note: e.note
            }))
        );
    };

    if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={36} /></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3"><BarChart3 className="text-blue-600" /> Finance Operating Center</h1>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Cobrança, conciliação e auditoria de rede</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select value={cycle} onChange={(e) => setCycle(e.target.value as SettlementCycle)} className="h-10 px-3 rounded-xl border border-gray-200 text-sm font-semibold bg-white">
                        <option value="MONTHLY">Mensal</option>
                        <option value="WEEKLY">Semanal</option>
                    </select>
                    <Button variant="outline" onClick={handleSaveCycle} disabled={savingCycle}>
                        {savingCycle ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Settings2 size={14} className="mr-2" />}
                        Salvar Ciclo
                    </Button>
                    <Button variant="outline" onClick={() => load(false)}><RefreshCw size={14} className="mr-2" /> Atualizar</Button>
                    <Button variant="outline" onClick={exportLedgerCsv}><Download size={14} className="mr-2" /> Exportar CSV</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-5 border border-gray-100"><p className="text-[10px] uppercase font-black text-gray-400">Venda Global</p><p className="text-2xl font-black text-gray-900 mt-1">{money(totalGlobalSales)}</p></Card>
                <Card className="p-5 border border-gray-100"><p className="text-[10px] uppercase font-black text-gray-400">Comissão Global</p><p className="text-2xl font-black text-blue-700 mt-1">{money(totalGlobalFees)}</p></Card>
                <Card className="p-5 border border-gray-100"><p className="text-[10px] uppercase font-black text-gray-400">A Receber</p><p className="text-2xl font-black text-red-600 mt-1">{money(totalFeesUnpaid)}</p></Card>
                <Card className="p-5 border border-gray-100"><p className="text-[10px] uppercase font-black text-gray-400">Eventos Ledger</p><p className="text-2xl font-black text-emerald-700 mt-1">{ledger.length}</p></Card>
            </div>

            <Card className="p-5 border border-gray-100">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs uppercase font-black text-gray-600 tracking-wider flex items-center gap-2"><Filter size={14} /> Operações</h3>
                    <Button variant="outline" onClick={() => setShowOps((v) => !v)}>{showOps ? 'Ocultar' : 'Mostrar'}</Button>
                </div>
                {showOps && (
                    <div className="space-y-4 mt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            <select value={selectedPharmacyId} onChange={(e) => { setSelectedPharmacyId(e.target.value); setSelectedPeriods([]); }} className="h-11 px-3 rounded-xl border border-gray-200 font-semibold">
                                <option value="">Selecione farmácia...</option>
                                {report.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            <input type="number" min="0" placeholder="Pagamento parcial (opcional)" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 font-semibold" />
                            <div className="flex gap-2">
                                <Button onClick={handleSettleSelected} disabled={!!actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    {actionLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Wallet size={14} className="mr-2" />}
                                    Liquidar
                                </Button>
                                <Button variant="outline" onClick={() => handleResetDebt(false)} disabled={!!actionLoading}><RotateCcw size={14} className="mr-2" /> Resetar</Button>
                                <Button variant="outline" onClick={() => handleResetDebt(true)} disabled={!!actionLoading}><AlertCircle size={14} className="mr-2" /> Reset Geral</Button>
                            </div>
                        </div>

                        <div className="border border-gray-200 rounded-2xl p-3">
                            {selectedPharmacyId ? (
                                <div className="flex flex-wrap gap-2">
                                    {(selectedPharmacyPeriods.length ? selectedPharmacyPeriods : [{ period: 'Sem pendências', amount: 0 }]).map((p) => {
                                        if (p.period === 'Sem pendências') return <span key="none" className="text-sm text-gray-400 italic">Sem períodos pendentes.</span>;
                                        const selected = selectedPeriods.includes(p.period);
                                        return (
                                            <button key={p.period} type="button" onClick={() => setSelectedPeriods((prev) => prev.includes(p.period) ? prev.filter((x) => x !== p.period) : [...prev, p.period])} className={`px-3 py-2 rounded-xl text-xs font-black border ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>
                                                {p.period} • {money(p.amount)}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic">Selecione uma farmácia para carregar períodos.</p>
                            )}
                        </div>
                        <p className="text-xs font-semibold text-gray-500">Selecionados: {selectedPeriods.length} • Total: {money(selectedPeriodsTotal)}</p>
                    </div>
                )}
            </Card>

            <Card className="p-0 overflow-hidden border border-gray-100">
                <div className="p-5 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="text-xs uppercase font-black text-gray-700 tracking-wider flex items-center gap-2"><Activity size={14} /> Ledger Financeiro</h3>
                    <div className="flex items-center gap-2">
                        <Badge color="gray">{ledger.filter((e) => e.operationType === 'SETTLEMENT').length} Liquidações</Badge>
                        <Badge color="gray">{ledger.filter((e) => e.operationType === 'RESET').length} Resets</Badge>
                    </div>
                </div>
                <LedgerTable entries={ledger} />
            </Card>

            <Card className="p-5 border border-gray-100 bg-gray-900 text-white">
                <div className="flex items-start gap-3">
                    <ShieldCheck className="text-emerald-400 mt-0.5" size={20} />
                    <div>
                        <p className="font-black">Compliance Financeiro Ativo</p>
                        <p className="text-sm text-gray-300 mt-1">
                            Todas as liquidações e resets passam por função transacional com trilha de auditoria no ledger.
                            O módulo está alinhado para operação administrativa de escala.
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
};
