import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { useAccountsData } from './useAccountsData'
import { useAccountActions } from './useAccountActions'
import QueueCards from './QueueCards'
import ApiKeysPanel from './ApiKeysPanel'
import AccountsTable from './AccountsTable'
import AddKeyModal from './AddKeyModal'
import AddAccountModal from './AddAccountModal'
import EditAccountModal from './EditAccountModal'

export default function AccountManagerContainer({ config, onRefresh, onMessage, authFetch }) {
    const { t } = useI18n()
    const apiFetch = authFetch || fetch

    const {
        queueStatus,
        keysExpanded,
        setKeysExpanded,
        accounts,
        page,
        pageSize,
        totalPages,
        totalAccounts,
        loadingAccounts,
        fetchAccounts,
        changePageSize,
        resolveAccountIdentifier,
        searchQuery,
        handleSearchChange,
        statusFilter,
        handleStatusFilterChange,
        statusCounts,
    } = useAccountsData({ apiFetch })

    const {
        showAddKey,
        openAddKey,
        openEditKey,
        closeKeyModal,
        editingKey,
        showAddAccount,
        openAddAccount,
        closeAddAccount,
        showEditAccount,
        editingAccount,
        editAccount,
        setEditAccount,
        openEditAccount,
        closeEditAccount,
        newKey,
        setNewKey,
        copiedKey,
        setCopiedKey,
        newAccount,
        setNewAccount,
        loading,
        testing,
        testingAll,
        batchProgress,
        sessionCounts,
        deletingSessions,
        updatingProxy,
        addKey,
        deleteKey,
        addAccount,
        updateAccount,
        deleteAccount,
        testAccount,
        testAllAccounts,
        testSelectedAccounts,
        testingSelected,
        deleteAllSessions,
        updateAccountProxy,
        deleteBatch,
        refreshMute,
        batchDeleting,
        refreshingMute,
    } = useAccountActions({
        apiFetch,
        t,
        onMessage,
        onRefresh,
        config,
        fetchAccounts,
        resolveAccountIdentifier,
    })

    const [selectedIds, setSelectedIds] = useState(() => new Set())

    // Clear selection whenever page / pageSize / search / statusFilter changes
    useEffect(() => {
        setSelectedIds(new Set())
    }, [page, pageSize, searchQuery, statusFilter])

    const pageIdentifiers = useMemo(
        () => accounts.map(acc => resolveAccountIdentifier(acc)).filter(Boolean),
        [accounts, resolveAccountIdentifier],
    )

    const handleSelectToggle = useCallback((id) => {
        if (!id) return
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const handleSelectAll = useCallback((checked) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (checked) {
                pageIdentifiers.forEach(id => next.add(id))
            } else {
                pageIdentifiers.forEach(id => next.delete(id))
            }
            return next
        })
    }, [pageIdentifiers])

    const handleBatchDelete = useCallback(async (idsArg) => {
        const ids = Array.isArray(idsArg) ? idsArg : Array.from(selectedIds)
        if (ids.length === 0) return
        if (!confirm(t('accountManager.deleteBatchConfirm', { count: ids.length }))) return
        const ok = await deleteBatch(ids)
        if (ok) setSelectedIds(new Set())
    }, [selectedIds, deleteBatch, t])

    const handleTestSelected = useCallback(async () => {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) return
        await testSelectedAccounts(ids)
    }, [selectedIds, testSelectedAccounts])

    const handleTestAll = useCallback(() => {
        return testAllAccounts({ statusFilter })
    }, [testAllAccounts, statusFilter])

    const handleRefreshMute = useCallback(() => {
        refreshMute()
    }, [refreshMute])

    return (
        <div className="space-y-6">
            {Boolean(config?.env_source_present) && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${
                    config?.env_writeback_enabled
                        ? (config?.env_backed ? 'border-amber-500/30 bg-amber-500/10 text-amber-600' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600')
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                }`}>
                    <p className="font-medium">
                        {config?.env_writeback_enabled
                            ? (config?.env_backed
                                ? t('accountManager.envModeWritebackPendingTitle')
                                : t('accountManager.envModeWritebackActiveTitle'))
                            : t('accountManager.envModeRiskTitle')}
                    </p>
                    <p className="mt-1 text-xs opacity-90">
                        {config?.env_writeback_enabled
                            ? t('accountManager.envModeWritebackDesc', { path: config?.config_path || 'config.json' })
                            : t('accountManager.envModeRiskDesc')}
                    </p>
                </div>
            )}

            <QueueCards queueStatus={queueStatus} t={t} />

            {queueStatus && queueStatus.total > 0 && queueStatus.muted === queueStatus.total && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5">⚠️</span>
                    <div className="flex-1">
                        <p className="font-medium">{t('accountManager.allMutedTitle')}</p>
                        <p className="mt-1 text-xs opacity-90">{t('accountManager.allMutedDesc', { count: queueStatus.total })}</p>
                    </div>
                    <button
                        onClick={handleRefreshMute}
                        disabled={refreshingMute}
                        className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 rounded-md text-xs font-medium border border-destructive/30 disabled:opacity-50 whitespace-nowrap"
                    >
                        {refreshingMute ? t('accountManager.refreshingMute') : t('accountManager.refreshMute')}
                    </button>
                </div>
            )}

            <ApiKeysPanel
                t={t}
                config={config}
                keysExpanded={keysExpanded}
                setKeysExpanded={setKeysExpanded}
                onAddKey={openAddKey}
                onEditKey={openEditKey}
                copiedKey={copiedKey}
                setCopiedKey={setCopiedKey}
                onDeleteKey={deleteKey}
            />

            <AccountsTable
                t={t}
                accounts={accounts}
                loadingAccounts={loadingAccounts}
                testing={testing}
                testingAll={testingAll}
                batchProgress={batchProgress}
                sessionCounts={sessionCounts}
                deletingSessions={deletingSessions}
                updatingProxy={updatingProxy}
                totalAccounts={totalAccounts}
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                resolveAccountIdentifier={resolveAccountIdentifier}
                proxies={config?.proxies || []}
                onTestAll={handleTestAll}
                onShowAddAccount={openAddAccount}
                onEditAccount={openEditAccount}
                onTestAccount={testAccount}
                onDeleteAccount={deleteAccount}
                onDeleteAllSessions={deleteAllSessions}
                onUpdateAccountProxy={updateAccountProxy}
                onPrevPage={() => fetchAccounts(page - 1)}
                onNextPage={() => fetchAccounts(page + 1)}
                onPageSizeChange={changePageSize}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                envBacked={Boolean(config?.env_backed)}
                selectedIds={selectedIds}
                onSelectToggle={handleSelectToggle}
                onSelectAll={handleSelectAll}
                onBatchDelete={handleBatchDelete}
                onTestSelected={handleTestSelected}
                testingSelected={testingSelected}
                statusFilter={statusFilter}
                onStatusFilterChange={handleStatusFilterChange}
                statusCounts={statusCounts}
                batchDeleting={batchDeleting}
                refreshingMute={refreshingMute}
            />

            <AddKeyModal
                show={showAddKey}
                t={t}
                editingKey={editingKey}
                newKey={newKey}
                setNewKey={setNewKey}
                loading={loading}
                onClose={closeKeyModal}
                onAdd={addKey}
            />

            <AddAccountModal
                show={showAddAccount}
                t={t}
                newAccount={newAccount}
                setNewAccount={setNewAccount}
                loading={loading}
                onClose={closeAddAccount}
                onAdd={addAccount}
            />

            <EditAccountModal
                show={showEditAccount}
                t={t}
                editingAccount={editingAccount}
                editAccount={editAccount}
                setEditAccount={setEditAccount}
                loading={loading}
                onClose={closeEditAccount}
                onSave={updateAccount}
            />
        </div>
    )
}
