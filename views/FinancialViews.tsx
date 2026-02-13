
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Badge, Button, Toast } from '../components/UI';
import { PharmacyFinancials, Order, CommissionStatus, SettlementCycle } from '../types';
import { fetchFinancialReport, getCachedFinancialReport, setCachedFinancialReport, fetchFinancialSettlementCycle, saveFinancialSettlementCycle, DEFAULT_FINANCIAL_SETTLEMENT_CYCLE, applyCommissionPaymentByPeriodByAdmin, resetCommissionDebtByAdmin } from '../services/dataService';
import { fetchOrders } from '../services/orderService';
import { 
    Wallet, TrendingUp, ShoppingBag, Percent, ArrowUpRight, 
    RefreshCw, BarChart3, CreditCard, Calendar, History, 
    CheckCircle, AlertCircle, Clock, ChevronDown, Download,
    ArrowRight, UserCheck, ShieldCheck, Loader2, Settings2, RotateCcw
} from 'lucide-react';
import { playSound } from '../services/soundService';

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

export const PharmacyFinancialView = ({ pharmacyId }: { pharmacyId: string }) => {
    const [data, setData] = useState<PharmacyFinancials | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [cycle, setCycle] = useState<SettlementCycle>(DEFAULT_FINANCIAL_SETTLEMENT_CYCLE);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    const load = async (useCache = false) => {
        setLoading(true);
        try {
            let reportData;
            
            // Tenta usar cache se disponível
            if (useCache) {
                reportData = getCachedFinancialReport();
            }
            
            // Se não há cache válido, faz fetch
            if (!reportData) {
                reportData = await fetchFinancialReport();
                if (reportData) {
                    setCachedFinancialReport(reportData);
                }
            }
            
            const [oData, cycleData] = await Promise.all([
                fetchOrders(pharmacyId),
                fetchFinancialSettlementCycle()
            ]);
            const myStats = reportData?.find((r: any) => r.id === pharmacyId);
            setData(myStats || null);
            setOrders(oData.filter(o => isCompletedOrderStatus(o.status)));
            setCycle(cycleData);
        } catch (err) {
            console.error("Erro ao carregar dados financeiros:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(true); }, [pharmacyId]);

    // Agrupar ordens por mês para o histórico de prestação de contas
    const monthlyStatements = useMemo(() => {
        const groups: Record<string, { sales: number, fees: number, status: CommissionStatus }> = {};
        
        orders.forEach(o => {
            const key = getPeriodKeyFromOrder(o, cycle);
            if (!key) return;
            
            if (!groups[key]) groups[key] = { sales: 0, fees: 0, status: 'PAID' };
            groups[key].sales += o.total;
            groups[key].fees += o.commissionAmount || 0;
            
            if (getOrderOutstandingAmount(o) > 0) groups[key].status = 'PENDING';
        });

        return Object.entries(groups).sort((a, b) => sortPeriodKeysDesc(a[0], b[0], cycle));
    }, [orders, cycle]);

    if(loading) return <div className="flex justify-center p-20"><RefreshCw className="animate-spin text-emerald-600" size={40}/></div>;
    if(!data) return <div className="p-20 text-center text-gray-400 italic">Sem registros financeiros.</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 flex items-center gap-3 uppercase tracking-tighter"><Wallet className="text-emerald-600" size={32}/> Auditoria Financeira</h1>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Controle de faturamento e taxas plataforma</p>
                </div>
                <Button onClick={() => load(false)} variant="outline" className="border-gray-200 bg-white"><RefreshCw size={16} className="mr-2"/> Sincronizar Tudo</Button>
            </div>

            {/* CARDS DE RESUMO INDUSTRIAL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-8 border-l-8 border-emerald-500 shadow-sm relative overflow-hidden bg-white">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Vendas Líquidas (Após Taxa)</p>
                    <h3 className="text-3xl font-black text-emerald-600">Kz {data.stats.netEarnings.toLocaleString()}</h3>
                    <p className="text-[9px] text-gray-400 mt-4 font-bold">Baseado em {orders.length} pedidos concluídos.</p>
                </Card>

                <Card className="p-8 border-l-8 border-red-500 shadow-sm bg-white">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total de Taxas FarmoLink</p>
                    <h3 className="text-3xl font-black text-red-600">Kz {data.stats.platformFees.toLocaleString()}</h3>
                    <div className="flex gap-4 mt-4">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 uppercase">Pagas</span>
                            <span className="text-xs font-bold text-emerald-600">Kz {data.stats.paidFees.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 uppercase">Em Aberto</span>
                            <span className="text-xs font-bold text-red-500">Kz {data.stats.unpaidFees.toLocaleString()}</span>
                        </div>
                    </div>
                </Card>

                <Card className="p-8 border-l-8 border-blue-500 shadow-sm bg-white">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pendente de Entrega/Conclusão</p>
                    <h3 className="text-3xl font-black text-blue-600">Kz {data.stats.pendingClearance.toLocaleString()}</h3>
                    <p className="text-[9px] text-gray-400 mt-4 font-bold uppercase tracking-tighter">Valores em fluxo de transação.</p>
                </Card>
            </div>

            {/* SEÇÃO DE PRESTAÇÃO DE CONTAS MENSAL */}
            <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2 px-2">
                    <History size={16}/> Histórico ({cycle === 'WEEKLY' ? 'Semanal' : 'Mensal'}) de Fechamento
                </h4>
                
                <div className="grid gap-4">
                    {monthlyStatements.length === 0 ? (
                        <div className="bg-white p-12 rounded-[32px] border-2 border-dashed text-center text-gray-300 italic">Aguardando primeira movimentação financeira.</div>
                    ) : (
                        monthlyStatements.map(([key, stats]) => (
                            <div key={key} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 hover:shadow-md transition-all">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex flex-col items-center justify-center border shadow-inner">
                                        <Calendar size={20} className="text-emerald-500 mb-1"/>
                                        <span className="text-[10px] font-black text-gray-800">{key}</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Faturamento do Mês</p>
                                        <p className="text-xl font-black text-gray-800">Kz {stats.sales.toLocaleString()}</p>
                                    </div>
                                    <div className="h-10 w-[1px] bg-gray-100 hidden md:block"></div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Taxa de Rede</p>
                                        <p className="text-xl font-black text-red-600">Kz {stats.fees.toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <Badge color={stats.status === 'PAID' ? 'green' : 'red'}>
                                        {stats.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE VALIDAÇÃO ADMIN'}
                                    </Badge>

                                    {stats.status !== 'PAID' && (
                                        <div className="flex items-center gap-2 text-[10px] font-black text-orange-500 uppercase">
                                            <Clock size={14}/> Aguardando Financeiro
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            </div>

            {/* INSTRUÇÕES FINANCEIRAS */}
            <div className="bg-gray-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1 space-y-4 text-center md:text-left">
                    <h4 className="text-2xl font-black flex items-center justify-center md:justify-start gap-3"><ShieldCheck className="text-emerald-400"/> Política de Repasse</h4>
                    <p className="text-gray-400 text-sm leading-relaxed font-medium">
                        O faturamento bruto é recebido pela farmácia no ato da entrega (TPA ou Dinheiro). 
                        A validação de cota é exclusiva do Admin. O ciclo de liquidação ativo é {cycle === 'WEEKLY' ? 'semanal' : 'mensal'}.
                    </p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-4">
                        <Badge color="gray" className="!bg-white/10 !text-white border-none px-4 py-2">
                            Ciclo: {cycle === 'WEEKLY' ? 'Semanal' : 'Mensal'}
                        </Badge>
                        <Badge color="gray" className="!bg-white/10 !text-white border-none px-4 py-2">Validação: Somente Admin</Badge>
                    </div>
                </div>
                <div className="w-full md:w-64 bg-emerald-800/30 p-8 rounded-[32px] border border-white/10 text-center">
                    <CreditCard className="mx-auto mb-4 text-emerald-400" size={48}/>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Dúvidas?</p>
                    <button className="mt-4 text-white font-bold underline text-sm hover:text-emerald-300">Falar com Financeiro</button>
                </div>
            </div>
        </div>
    );
};

export const AdminFinancialView = () => {
    const [report, setReport] = useState<PharmacyFinancials[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [cycle, setCycle] = useState<SettlementCycle>(DEFAULT_FINANCIAL_SETTLEMENT_CYCLE);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [savingCycle, setSavingCycle] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    const [showOpsHub, setShowOpsHub] = useState(false);
    const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
    const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
    const [partialAmount, setPartialAmount] = useState('');

    useEffect(() => { load(true); }, []);

    const load = async (useCache = false) => {
        setLoading(true);
        try {
            let reportData;
            
            if (useCache) {
                reportData = getCachedFinancialReport();
            }
            
            if (!reportData) {
                reportData = await fetchFinancialReport();
                if (reportData) {
                    setCachedFinancialReport(reportData);
                }
            }
            
            const [allOrders, cycleData] = await Promise.all([
                fetchOrders(),
                fetchFinancialSettlementCycle()
            ]);
            setReport(reportData || []);
            setOrders(allOrders.filter(o => isCompletedOrderStatus(o.status)));
            setCycle(cycleData);
        } catch (err) {
            console.error("Erro ao carregar relatório admin:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCycle = async () => {
        setSavingCycle(true);
        const ok = await saveFinancialSettlementCycle(cycle);
        setSavingCycle(false);
        if (ok) {
            setToast({ msg: `Periodicidade alterada para ${cycle === 'WEEKLY' ? 'semanal' : 'mensal'}.`, type: 'success' });
        } else {
            setToast({ msg: 'Falha ao salvar periodicidade financeira.', type: 'error' });
        }
    };

    const pendingMonthsByPharmacy = useMemo(() => {
        const pendingMap: Record<string, Set<string>> = {};

        orders.forEach(o => {
            if (!o.pharmacyId || getOrderOutstandingAmount(o) <= 0) return;
            const key = getPeriodKeyFromOrder(o, cycle);
            if (!key) return;
            if (!pendingMap[o.pharmacyId]) pendingMap[o.pharmacyId] = new Set<string>();
            pendingMap[o.pharmacyId].add(key);
        });

        return Object.fromEntries(
            Object.entries(pendingMap).map(([pharmacyId, months]) => [pharmacyId, Array.from(months).sort((a, b) => sortPeriodKeysDesc(a, b, cycle))])
        ) as Record<string, string[]>;
    }, [orders, cycle]);

    const pendingByPharmacyAndPeriod = useMemo(() => {
        const map: Record<string, Record<string, number>> = {};
        orders.forEach(order => {
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

    const selectedPeriodsTotal = useMemo(() => selectedPeriods.reduce((acc, period) => {
        const amount = pendingByPharmacyAndPeriod[selectedPharmacyId]?.[period] || 0;
        return acc + amount;
    }, 0), [selectedPeriods, pendingByPharmacyAndPeriod, selectedPharmacyId]);

    const onChangeSelectedPharmacy = (id: string) => {
        setSelectedPharmacyId(id);
        setSelectedPeriods([]);
        setPartialAmount('');
    };

    const handleConfirmReceipt = async (pharmacyId: string, name: string, periods: string[]) => {
        if (!periods.length) {
            setToast({msg: "Nenhum período pendente encontrado para esta farmácia.", type: 'error'});
            return;
        }

        const periodLabel = periods.join(', ');
        if (!confirm(`Confirma a validação de pagamento da farmácia ${name} nos períodos: ${periodLabel}?`)) return;

        setActionLoading(pharmacyId);
        let updatedAny = false;

        for (const periodKey of periods) {
            const result = await applyCommissionPaymentByPeriodByAdmin(pharmacyId, periodKey, cycle);
            if (!result.success && result.error) {
                setToast({msg: result.error, type: 'error'});
            }
            if (result.success && result.updatedCount > 0) updatedAny = true;
        }

        if (updatedAny) {
            playSound('cash');
            setToast({msg: `Recebimento confirmado para ${name} (${periods.length} período(s)).`, type: 'success'});
            await load(false);
        } else {
            setToast({msg: `Sem pendências elegíveis para liquidar em ${name}.`, type: 'error'});
        }
        setActionLoading(null);
    };

    const handleTogglePeriod = (period: string) => {
        setSelectedPeriods(prev => prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]);
    };

    const handleSettleSelectedPeriods = async () => {
        if (!selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmácia para operar.', type: 'error' });
            return;
        }
        if (!selectedPeriods.length) {
            setToast({ msg: 'Selecione ao menos um período.', type: 'error' });
            return;
        }

        const selectedPharmacy = report.find(r => r.id === selectedPharmacyId);
        const label = selectedPeriods.join(', ');
        if (!confirm(`Liquidar totalmente os períodos ${label} para ${selectedPharmacy?.name || 'farmácia selecionada'}?`)) return;

        setActionLoading(selectedPharmacyId);
        let updatedAny = false;
        for (const periodKey of selectedPeriods) {
            const result = await applyCommissionPaymentByPeriodByAdmin(selectedPharmacyId, periodKey, cycle);
            if (!result.success && result.error) {
                setToast({ msg: result.error, type: 'error' });
                setActionLoading(null);
                return;
            }
            if (result.updatedCount > 0) updatedAny = true;
        }

        setActionLoading(null);
        if (!updatedAny) {
            setToast({ msg: 'Sem pendências elegíveis para os períodos selecionados.', type: 'error' });
            return;
        }
        playSound('cash');
        setToast({ msg: 'Liquidação concluída para os períodos selecionados.', type: 'success' });
        await load(false);
    };

    const handleApplyPartialPayment = async () => {
        if (!selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmácia para aplicar pagamento parcial.', type: 'error' });
            return;
        }
        if (!selectedPeriods.length) {
            setToast({ msg: 'Selecione ao menos um período para pagamento parcial.', type: 'error' });
            return;
        }
        const amount = Number(partialAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setToast({ msg: 'Informe um valor de pagamento parcial válido.', type: 'error' });
            return;
        }

        const totalPending = selectedPeriods.reduce((acc, period) => acc + (pendingByPharmacyAndPeriod[selectedPharmacyId]?.[period] || 0), 0);
        if (totalPending <= 0) {
            setToast({ msg: 'Não há saldo pendente para os períodos selecionados.', type: 'error' });
            return;
        }

        if (!confirm(`Aplicar pagamento parcial de Kz ${amount.toLocaleString()}?`)) return;

        setActionLoading(selectedPharmacyId);
        let remaining = amount;
        let appliedTotal = 0;

        for (const periodKey of selectedPeriods.sort((a, b) => sortPeriodKeysDesc(b, a, cycle))) {
            if (remaining <= 0) break;
            const result = await applyCommissionPaymentByPeriodByAdmin(selectedPharmacyId, periodKey, cycle, remaining);
            if (!result.success && result.error) {
                setToast({ msg: result.error, type: 'error' });
                setActionLoading(null);
                return;
            }
            appliedTotal += result.appliedAmount;
            remaining = result.remainingAmount;
        }

        setActionLoading(null);
        if (appliedTotal <= 0) {
            setToast({ msg: 'Nenhum valor aplicado. Verifique se há pendências reais.', type: 'error' });
            return;
        }

        playSound('cash');
        setToast({
            msg: `Pagamento parcial aplicado: Kz ${appliedTotal.toLocaleString()}${remaining > 0 ? ` (saldo não aplicado: Kz ${remaining.toLocaleString()})` : ''}.`,
            type: 'success'
        });
        await load(false);
    };

    const handleResetDebt = async (resetAll: boolean) => {
        if (!resetAll && !selectedPharmacyId) {
            setToast({ msg: 'Selecione uma farmácia para resetar a dívida.', type: 'error' });
            return;
        }
        const targetName = resetAll ? 'TODA A REDE' : (report.find(r => r.id === selectedPharmacyId)?.name || 'farmácia selecionada');
        if (!confirm(`Confirmar reset de dívida para ${targetName}? Esta ação zera pagamentos registrados e volta status para PENDING.`)) return;

        setActionLoading(resetAll ? 'ALL' : selectedPharmacyId);
        const result = await resetCommissionDebtByAdmin(resetAll ? undefined : selectedPharmacyId);
        setActionLoading(null);
        if (!result.success) {
            setToast({ msg: result.error || 'Falha ao resetar dívida.', type: 'error' });
            return;
        }

        setToast({ msg: `Reset concluído. ${result.updatedCount} pedido(s) ajustado(s).`, type: 'success' });
        await load(false);
    };

    if(loading) return <div className="flex justify-center p-20"><RefreshCw className="animate-spin text-emerald-600" size={40}/></div>;

    const totalGlobalSales = report.reduce((acc, r) => acc + r.stats.totalSales, 0);
    const totalGlobalFees = report.reduce((acc, r) => acc + r.stats.platformFees, 0);
    const totalFeesUnpaid = report.reduce((acc, r) => acc + r.stats.unpaidFees, 0);

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 flex items-center gap-3 tracking-tighter"><BarChart3 className="text-blue-600" size={32}/> Consolidação de Rede</h1>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Gestão de recebíveis e liquidação de parceiros</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={cycle}
                        onChange={e => setCycle(e.target.value as SettlementCycle)}
                        className="h-10 px-3 border border-gray-200 rounded-xl text-xs font-bold bg-white"
                    >
                        <option value="MONTHLY">Mensal</option>
                        <option value="WEEKLY">Semanal</option>
                    </select>
                    <Button onClick={handleSaveCycle} disabled={savingCycle} variant="outline" className="h-10 border-gray-200 bg-white">
                        {savingCycle ? <Loader2 size={14} className="mr-2 animate-spin"/> : null}
                        Salvar Ciclo
                    </Button>
                    <Button onClick={() => setShowOpsHub(prev => !prev)} variant="outline" className="h-10 border-gray-200 bg-white">
                        <Settings2 size={14} className="mr-2"/> {showOpsHub ? 'Fechar Operações' : 'Operações de Pagamento'}
                    </Button>
                    <Button onClick={() => load(false)} variant="outline" className="h-10 border-gray-200 bg-white"><RefreshCw size={14} className="mr-2"/> Atualizar Painel</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-600 p-8 rounded-[32px] text-white shadow-xl shadow-emerald-100 relative overflow-hidden group">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Taxas Plataforma (Global)</p>
                    <h3 className="text-4xl font-black">Kz {totalGlobalFees.toLocaleString()}</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Volume Total de Vendas</p>
                    <h3 className="text-4xl font-black text-gray-800">Kz {totalGlobalSales.toLocaleString()}</h3>
                </div>
                <div className="bg-red-600 p-8 rounded-[32px] text-white shadow-xl shadow-red-100 relative overflow-hidden group">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">A Receber das Farmácias</p>
                    <h3 className="text-4xl font-black">Kz {totalFeesUnpaid.toLocaleString()}</h3>
                </div>
            </div>

            {showOpsHub && (
                <Card className="p-6 rounded-[32px] border-gray-100 bg-white">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h4 className="text-sm font-black text-gray-700 uppercase tracking-widest">Operações de Pagamento</h4>
                            <p className="text-xs text-gray-400 font-medium mt-1">
                                Liquidação total ou parcial por período ({cycle === 'WEEKLY' ? 'semanal' : 'mensal'}) com validação exclusiva do Admin.
                            </p>
                        </div>
                        <Badge color="gray" className="!bg-gray-100 !text-gray-700 border-none">
                            Gestão de dívida em etapas
                        </Badge>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                        <div className="lg:col-span-1">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Farmácia</label>
                            <select
                                value={selectedPharmacyId}
                                onChange={(e) => onChangeSelectedPharmacy(e.target.value)}
                                className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm font-semibold bg-white"
                            >
                                <option value="">Selecionar...</option>
                                {report.map(item => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="lg:col-span-2">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Períodos Pendentes</label>
                            <div className="border border-gray-200 rounded-2xl p-3 min-h-[84px]">
                                {!selectedPharmacyId ? (
                                    <p className="text-sm text-gray-400 italic">Selecione uma farmácia para listar períodos.</p>
                                ) : selectedPharmacyPeriods.length === 0 ? (
                                    <p className="text-sm text-gray-400 italic">Sem períodos pendentes nesta farmácia.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPharmacyPeriods.map(item => {
                                            const selected = selectedPeriods.includes(item.period);
                                            return (
                                                <button
                                                    type="button"
                                                    key={item.period}
                                                    onClick={() => handleTogglePeriod(item.period)}
                                                    className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}
                                                >
                                                    {item.period} • Kz {Math.round(item.amount).toLocaleString()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                        <div className="lg:col-span-1">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Valor parcial (Kz)</label>
                            <input
                                type="number"
                                min="0"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm font-semibold"
                                placeholder="Ex: 50000"
                            />
                        </div>
                        <div className="lg:col-span-2 flex flex-wrap items-end gap-2">
                            <Button
                                onClick={handleSettleSelectedPeriods}
                                disabled={!!actionLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {actionLoading ? <Loader2 size={14} className="mr-2 animate-spin"/> : <UserCheck size={14} className="mr-2"/>}
                                Liquidar Períodos Selecionados
                            </Button>
                            <Button
                                onClick={handleApplyPartialPayment}
                                disabled={!!actionLoading}
                                variant="outline"
                                className="border-blue-200 text-blue-700"
                            >
                                {actionLoading ? <Loader2 size={14} className="mr-2 animate-spin"/> : <Wallet size={14} className="mr-2"/>}
                                Registrar Pagamento Parcial
                            </Button>
                            <Button
                                onClick={() => handleResetDebt(false)}
                                disabled={!!actionLoading}
                                variant="outline"
                                className="border-orange-200 text-orange-700"
                            >
                                <RotateCcw size={14} className="mr-2"/> Resetar Dívida da Farmácia
                            </Button>
                            <Button
                                onClick={() => handleResetDebt(true)}
                                disabled={!!actionLoading}
                                variant="outline"
                                className="border-red-200 text-red-700"
                            >
                                <AlertCircle size={14} className="mr-2"/> Reset Geral
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-gray-50 rounded-xl text-xs font-semibold text-gray-600">
                        Períodos selecionados: {selectedPeriods.length} • Total pendente selecionado: Kz {Math.round(selectedPeriodsTotal).toLocaleString()}
                    </div>
                </Card>
            )}

            {/* TABELA DE LIQUIDAÇÃO DETALHADA */}
            <Card className="p-0 overflow-hidden shadow-sm border-gray-100 rounded-[32px] bg-white">
                <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Painel de Cobrança por Farmácia</h4>
                    <span className="text-[10px] font-bold text-gray-400">{report.length} parceiros monitorados</span>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm min-w-[900px]">
                        <thead className="bg-white border-b text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <tr>
                                <th className="p-6">Farmácia Parceira</th>
                                <th className="p-6 text-right">Faturamento Concluído</th>
                                <th className="p-6 text-right">Taxa Devida</th>
                                <th className="p-6 text-right">Status de Liquidação</th>
                                <th className="p-6 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 bg-white">
                            {report.map(r => {
                                const pendingMonths = pendingMonthsByPharmacy[r.id] || [];
                                return (
                                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">{r.name.charAt(0)}</div>
                                            <div>
                                                <span className="font-black text-gray-800 text-sm">{r.name}</span>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Comissão: {r.commissionRate}%</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right font-mono font-bold text-gray-600">Kz {r.stats.totalSales.toLocaleString()}</td>
                                    <td className="p-6 text-right font-mono font-black text-red-600">Kz {r.stats.platformFees.toLocaleString()}</td>
                                    <td className="p-6 text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <Badge color={r.stats.unpaidFees <= 0 ? 'green' : 'red'}>
                                                {r.stats.unpaidFees <= 0 ? 'EM DIA' : `PENDENTE: Kz ${r.stats.unpaidFees.toLocaleString()}`}
                                            </Badge>
                                            <span className="text-[9px] text-gray-400 font-bold uppercase">Pago: Kz {r.stats.paidFees.toLocaleString()}</span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right">
                                        {pendingMonths.length > 0 ? (
                                            <button 
                                                onClick={() => handleConfirmReceipt(r.id, r.name, pendingMonths)}
                                                disabled={!!actionLoading}
                                                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 shadow-lg shadow-blue-100 flex items-center gap-2 ml-auto"
                                            >
                                                {actionLoading === r.id ? <Loader2 className="animate-spin" size={12}/> : <UserCheck size={12}/>}
                                                Liquidar {pendingMonths.length} período(s)
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2 text-emerald-500 font-black uppercase text-[10px] justify-end">
                                                <CheckCircle size={14}/> Tudo Pago
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="bg-white p-8 rounded-[40px] border border-blue-100 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-inner"><Download size={32}/></div>
                    <div>
                        <h4 className="font-black text-lg text-gray-800">Exportar Livro de Caixa</h4>
                        <p className="text-gray-400 text-sm font-medium">Baixe todos os registros financeiros deste mês em formato auditável.</p>
                    </div>
                </div>
                <button className="px-8 py-4 border-2 border-blue-600 text-blue-600 rounded-2xl font-black text-sm hover:bg-blue-50 transition-all flex items-center gap-2">Gerar CSV <ArrowRight size={18}/></button>
            </div>
        </div>
    );
};



