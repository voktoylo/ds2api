import { useEffect, useState } from 'react'

export function useAccountsData({ apiFetch }) {
    const [queueStatus, setQueueStatus] = useState(null)
    const [keysExpanded, setKeysExpanded] = useState(false)

    const [accounts, setAccounts] = useState([])
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [totalPages, setTotalPages] = useState(1)
    const [totalAccounts, setTotalAccounts] = useState(0)
    const [loadingAccounts, setLoadingAccounts] = useState(false)
    const [statusCounts, setStatusCounts] = useState({ all: 0, active: 0, muted: 0, permban: 0, error: 0 })

    const resolveAccountIdentifier = (acc) => {
        if (!acc || typeof acc !== 'object') return ''
        return String(acc.identifier || acc.email || acc.mobile || '').trim()
    }

    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')

    const fetchAccounts = async (
        targetPage = page,
        targetPageSize = pageSize,
        targetQuery = searchQuery,
        targetStatus = statusFilter,
    ) => {
        setLoadingAccounts(true)
        try {
            let url = `/admin/accounts?page=${targetPage}&page_size=${targetPageSize}`
            if (targetQuery.trim()) url += `&q=${encodeURIComponent(targetQuery.trim())}`
            if (targetStatus && targetStatus !== 'all') url += `&status=${encodeURIComponent(targetStatus)}`
            const res = await apiFetch(url)
            if (res.ok) {
                const data = await res.json()
                setAccounts(data.items || [])
                setTotalPages(data.total_pages || 1)
                setTotalAccounts(data.total || 0)
                setPage(data.page || 1)
                if (data.status_counts && typeof data.status_counts === 'object') {
                    setStatusCounts({ all: 0, active: 0, muted: 0, permban: 0, error: 0, ...data.status_counts })
                }
            }
        } catch (e) {
            console.error('Failed to fetch accounts:', e)
        } finally {
            setLoadingAccounts(false)
        }
    }

    const changePageSize = (newSize) => {
        setPageSize(newSize)
        fetchAccounts(1, newSize, searchQuery, statusFilter)
    }

    const handleSearchChange = (query) => {
        setSearchQuery(query)
        fetchAccounts(1, pageSize, query, statusFilter)
    }

    const handleStatusFilterChange = (next) => {
        setStatusFilter(next)
        fetchAccounts(1, pageSize, searchQuery, next)
    }

    const fetchQueueStatus = async () => {
        try {
            const res = await apiFetch('/admin/queue/status')
            if (res.ok) {
                const data = await res.json()
                setQueueStatus(data)
            }
        } catch (e) {
            console.error('Failed to fetch queue status:', e)
        }
    }

    useEffect(() => {
        fetchAccounts()
        fetchQueueStatus()
        const queueInterval = setInterval(fetchQueueStatus, 5000)
        return () => clearInterval(queueInterval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return {
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
    }
}
