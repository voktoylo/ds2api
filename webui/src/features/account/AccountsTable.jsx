import { useState } from 'react'
import { ChevronLeft, ChevronRight, Check, Copy, Pencil, Play, Plus, Trash2, FolderX, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const formatMuteTime = (value) => {
    if (value === null || value === undefined || value === '') return ''
    let date
    if (typeof value === 'number') {
        // UNIX seconds or ms
        date = new Date(value > 1e12 ? value : value * 1000)
    } else {
        date = new Date(value)
    }
    if (Number.isNaN(date.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AccountsTable({
    t,
    accounts,
    loadingAccounts,
    testing,
    testingAll,
    batchProgress,
    sessionCounts,
    deletingSessions,
    updatingProxy,
    totalAccounts,
    page,
    pageSize,
    totalPages,
    resolveAccountIdentifier,
    proxies,
    onTestAll,
    onShowAddAccount,
    onEditAccount,
    onTestAccount,
    onDeleteAccount,
    onDeleteAllSessions,
    onUpdateAccountProxy,
    onPrevPage,
    onNextPage,
    onPageSizeChange,
    searchQuery,
    onSearchChange,
    envBacked = false,
    selectedIds,
    onSelectToggle,
    onSelectAll,
    onBatchDelete,
    onTestSelected,
    testingSelected = false,
    batchDeleting = false,
    refreshingMute = false,
    statusFilter = 'all',
    onStatusFilterChange,
    statusCounts,
}) {
    const [copiedId, setCopiedId] = useState(null)

    const copyId = (id) => {
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id)
            setTimeout(() => setCopiedId(null), 1500)
        })
    }

    const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || [])
    const pageIds = accounts.map(acc => resolveAccountIdentifier(acc)).filter(Boolean)
    const selectedOnPageCount = pageIds.reduce((n, id) => n + (selectedSet.has(id) ? 1 : 0), 0)
    const allOnPageSelected = pageIds.length > 0 && selectedOnPageCount === pageIds.length
    const someOnPageSelected = selectedOnPageCount > 0 && !allOnPageSelected
    const totalSelected = selectedSet.size

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold">{t('accountManager.accountsTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('accountManager.accountsDesc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder={t('accountManager.searchPlaceholder')}
                        className="px-3 py-1.5 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                    />
                    {totalSelected > 0 && onBatchDelete && (
                        <button
                            onClick={() => onBatchDelete(Array.from(selectedSet))}
                            disabled={batchDeleting}
                            className="flex items-center gap-1.5 px-3 py-2 bg-destructive/10 text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/20 transition-colors text-xs font-medium disabled:opacity-50"
                        >
                            {batchDeleting ? <span className="animate-spin">⟳</span> : <Trash2 className="w-3 h-3" />}
                            {t('accountManager.deleteSelected', { count: totalSelected })}
                        </button>
                    )}
                    <button
                        onClick={onTestAll}
                        disabled={testingAll || totalAccounts === 0}
                        className="flex items-center px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border disabled:opacity-50"
                    >
                        {(testingAll || refreshingMute) ? <span className="animate-spin mr-2">⟳</span> : <RefreshCw className="w-3 h-3 mr-2" />}
                        {testingAll ? t('accountManager.refreshingAll') : t('accountManager.refreshAll')}
                    </button>
                    {onTestSelected && (
                        <button
                            onClick={onTestSelected}
                            disabled={testingAll || testingSelected || totalSelected === 0}
                            className="flex items-center px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border disabled:opacity-50"
                        >
                            {testingSelected ? <span className="animate-spin mr-2">⟳</span> : <RefreshCw className="w-3 h-3 mr-2" />}
                            {testingSelected ? t('accountManager.refreshingSelected') : t('accountManager.refreshSelected')}
                        </button>
                    )}
                    <button
                        onClick={onShowAddAccount}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        {t('accountManager.addAccount')}
                    </button>
                </div>
            </div>

            {onStatusFilterChange && (
                <div className="px-6 pt-4 pb-2 border-b border-border flex flex-wrap gap-1">
                    {[
                        { key: 'all', label: t('accountManager.statusTabAll') },
                        { key: 'active', label: t('accountManager.statusTabActive') },
                        { key: 'unrefreshed', label: t('accountManager.statusTabUnrefreshed') },
                        { key: 'muted', label: t('accountManager.statusTabMuted') },
                        { key: 'permban', label: t('accountManager.statusTabPermban') },
                        { key: 'error', label: t('accountManager.statusTabError') },
                    ].map(tab => {
                        const count = statusCounts && typeof statusCounts[tab.key] === 'number' ? statusCounts[tab.key] : 0
                        const active = statusFilter === tab.key
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onStatusFilterChange(tab.key)}
                                className={clsx(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                                    active
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                                )}
                            >
                                {tab.label} <span className={clsx("ml-1 text-[10px] opacity-70", active && "opacity-100")}>({count})</span>
                            </button>
                        )
                    })}
                </div>
            )}

            {testingAll && batchProgress.total > 0 && (
                <div className="p-4 border-b border-border bg-muted/30">
                    <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium">{t('accountManager.testingAllAccounts')}</span>
                        <span className="text-muted-foreground">{batchProgress.current} / {batchProgress.total}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-4">
                        <div
                            className="bg-primary h-full transition-all duration-300"
                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        />
                    </div>
                    {batchProgress.results.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                            {batchProgress.results.map((r, i) => (
                                <div key={i} className={clsx(
                                    "text-xs px-2 py-1 rounded border truncate",
                                    r.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-destructive/10 border-destructive/20 text-destructive"
                                )}>
                                    {r.success ? '✓' : '✗'} {r.id}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!loadingAccounts && accounts.length > 0 && onSelectAll && (
                <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-3 text-xs text-muted-foreground">
                    <input
                        type="checkbox"
                        aria-label={t('accountManager.selectAll')}
                        checked={allOnPageSelected}
                        ref={el => { if (el) el.indeterminate = someOnPageSelected }}
                        onChange={e => onSelectAll(e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-primary"
                    />
                    <span>{t('accountManager.selectAll')}</span>
                    {totalSelected > 0 && (
                        <span className="font-medium text-foreground">({totalSelected})</span>
                    )}
                </div>
            )}

            <div className="divide-y divide-border">
                {loadingAccounts ? (
                    <div className="p-8 text-center text-muted-foreground">{t('actions.loading')}</div>
                ) : accounts.length > 0 ? (
                    accounts.map((acc, i) => {
                        const id = resolveAccountIdentifier(acc)
                        const assignedProxy = proxies.find(proxy => proxy.id === acc.proxy_id)
                        const runtimeUnknown = envBacked && !acc.test_status
                        const isActive = acc.test_status === 'ok' || acc.has_token
                        const isSelected = id && selectedSet.has(id)
                        const isMuted = Boolean(acc.is_muted)
                        const muteUntilStr = formatMuteTime(acc.mute_until)
                        const muteCheckedStr = formatMuteTime(acc.mute_checked_at)
                        let muteTooltip
                        if (isMuted) {
                            muteTooltip = muteUntilStr
                                ? t('accountManager.muteStatusMuted', { time: muteUntilStr })
                                : t('accountManager.muteStatusMutedUnknown')
                        } else {
                            muteTooltip = t('accountManager.muteStatusActive')
                            if (muteCheckedStr) {
                                muteTooltip += ' · ' + t('accountManager.muteLastChecked', { time: muteCheckedStr })
                            }
                        }
                        return (
                            <div key={i} className={clsx(
                                "p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors",
                                isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50",
                            )}>
                                <div className="flex items-center gap-3 min-w-0">
                                    {onSelectToggle && (
                                        <input
                                            type="checkbox"
                                            aria-label={id || ''}
                                            checked={Boolean(isSelected)}
                                            disabled={!id}
                                            onChange={() => onSelectToggle(id)}
                                            className="w-4 h-4 cursor-pointer accent-primary shrink-0"
                                        />
                                    )}
                                    <div className={clsx(
                                        "w-2 h-2 rounded-full shrink-0",
                                        acc.test_status === 'failed' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                        isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                        runtimeUnknown ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-amber-500"
                                    )} />
                                    <div
                                        title={muteTooltip}
                                        aria-label={muteTooltip}
                                        className={clsx(
                                            "flex items-center justify-center w-5 h-5 rounded-full shrink-0",
                                            isMuted
                                                ? "bg-red-500/15 text-red-500"
                                                : "bg-emerald-500/15 text-emerald-500",
                                        )}
                                    >
                                        {isMuted
                                            ? <ShieldAlert className="w-3 h-3" />
                                            : <ShieldCheck className="w-3 h-3" />}
                                    </div>
                                    <div className="min-w-0">
                                        {acc.name && (
                                            <div className="text-sm font-medium truncate">{acc.name}</div>
                                        )}
                                        <div
                                            className="font-medium truncate flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors group"
                                            onClick={() => copyId(id)}
                                        >
                                            <span className="truncate">{id || '-'}</span>
                                            {copiedId === id
                                                ? <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                                : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" />
                                            }
                                        </div>
                                        {acc.remark && (
                                            <div className="text-xs text-muted-foreground truncate mt-0.5">{acc.remark}</div>
                                        )}
                                        {acc.test_status === 'failed' && acc.last_error && (
                                            <div className="text-xs text-red-500 truncate mt-0.5" title={acc.last_error}>
                                                {t('accountManager.lastErrorLabel')}: {acc.last_error}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                            <span>{acc.test_status === 'failed' ? t('accountManager.testStatusFailed') : isActive ? t('accountManager.sessionActive') : runtimeUnknown ? t('accountManager.runtimeStatusUnknown') : t('accountManager.reauthRequired')}</span>
                                            {isMuted && (
                                                <span className="font-mono bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded text-[10px]">
                                                    {muteUntilStr
                                                        ? t('accountManager.muteStatusMuted', { time: muteUntilStr })
                                                        : t('accountManager.muteStatusMutedUnknown')}
                                                </span>
                                            )}
                                            {acc.token_preview && (
                                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                                    {acc.token_preview}
                                                </span>
                                            )}
                                            {sessionCounts && sessionCounts[id] !== undefined && (
                                                <span className="font-mono bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded text-[10px]">
                                                    {t('accountManager.sessionCount', { count: sessionCounts[id] })}
                                                </span>
                                            )}
                                            {sessionCounts && sessionCounts[id] !== undefined && sessionCounts[id] > 0 && (
                                                <button
                                                    onClick={() => onDeleteAllSessions(id)}
                                                    disabled={deletingSessions && deletingSessions[id]}
                                                    className="flex items-center gap-1 font-mono bg-red-500/10 text-red-500 hover:bg-red-500/20 px-1.5 py-0.5 rounded text-[10px] transition-colors disabled:opacity-50"
                                                    title={t('accountManager.deleteAllSessions')}
                                                >
                                                    {deletingSessions && deletingSessions[id] ? (
                                                        <span className="animate-spin">⟳</span>
                                                    ) : (
                                                        <FolderX className="w-3 h-3" />
                                                    )}
                                                </button>
                                            )}
                                            {acc.proxy_id && (
                                                <span className="font-mono bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">
                                                    {t('accountManager.proxyBadge', { name: assignedProxy ? (assignedProxy.name || `${assignedProxy.host}:${assignedProxy.port}`) : acc.proxy_id })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 self-start lg:self-auto ml-5 lg:ml-0">
                                    <select
                                        value={acc.proxy_id || ''}
                                        onChange={e => onUpdateAccountProxy(id, e.target.value)}
                                        disabled={updatingProxy?.[id]}
                                        className="max-w-[180px] px-2.5 py-1.5 text-[10px] lg:text-xs bg-secondary border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                    >
                                        <option value="">{t('accountManager.proxyNone')}</option>
                                        {proxies.map(proxy => (
                                            <option key={proxy.id} value={proxy.id}>
                                                {proxy.name || `${proxy.host}:${proxy.port}`}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => onEditAccount(acc)}
                                        disabled={!id}
                                        className="p-1 lg:p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        title={id ? t('accountManager.editAccountTitle') : t('accountManager.invalidIdentifier')}
                                    >
                                        <Pencil className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                    </button>
                                    <button
                                        onClick={() => onTestAccount(id)}
                                        disabled={testing[id]}
                                        className="px-2 lg:px-3 py-1 lg:py-1.5 text-[10px] lg:text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
                                    >
                                        {testing[id] ? t('actions.testing') : t('actions.test')}
                                    </button>
                                    <button
                                        onClick={() => onDeleteAccount(id)}
                                        className="p-1 lg:p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <div className="p-8 text-center text-muted-foreground">{searchQuery ? t('accountManager.searchNoResults') : t('accountManager.noAccounts')}</div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="p-4 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground">
                            {t('accountManager.pageInfo', { current: page, total: totalPages, count: totalAccounts })}
                        </div>
                        <select
                            value={pageSize}
                            onChange={e => onPageSizeChange(Number(e.target.value))}
                            className="text-sm border border-border rounded-md px-2 py-1 bg-background text-foreground"
                        >
                            {[10, 20, 50, 100, 500, 1000, 2000, 5000].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onPrevPage}
                            disabled={page <= 1 || loadingAccounts}
                            className="p-2 border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium px-2">{page} / {totalPages}</span>
                        <button
                            onClick={onNextPage}
                            disabled={page >= totalPages || loadingAccounts}
                            className="p-2 border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
