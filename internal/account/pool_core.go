package account

import (
	"sort"
	"sync"

	"ds2api/internal/account/mutestate"
	"ds2api/internal/config"
)

// StrategyRoundRobin keeps the legacy behavior where each acquired account
// moves to the back of the queue so successive requests cycle through the
// pool. StrategySticky keeps the chosen account at the head of the queue so
// future requests stay on it until it becomes muted or otherwise unselectable.
const (
	StrategyRoundRobin = "round_robin"
	StrategySticky     = "sticky"
)

type Pool struct {
	store                  *config.Store
	mu                     sync.Mutex
	queue                  []string
	inUse                  map[string]int
	waiters                []chan struct{}
	maxInflightPerAccount  int
	recommendedConcurrency int
	maxQueueSize           int
	globalMaxInflight      int

	// muteStore is consulted by acquire to skip silently-muted accounts.
	// Nil = mute filtering disabled (legacy behavior).
	muteStore *mutestate.Store

	// strategy controls how the queue is reordered after a successful
	// acquire. Default is StrategyRoundRobin.
	strategy string
}

func NewPool(store *config.Store) *Pool {
	maxPer := 2
	if store != nil {
		maxPer = store.RuntimeAccountMaxInflight()
	}
	p := &Pool{
		store:                 store,
		inUse:                 map[string]int{},
		maxInflightPerAccount: maxPer,
		strategy:              StrategyRoundRobin,
	}
	p.Reset()
	return p
}

// AttachMuteStore wires in the mute-status store consulted by acquire.
// Pass nil to disable mute-aware selection.
func (p *Pool) AttachMuteStore(s *mutestate.Store) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.muteStore = s
}

// SetStrategy chooses between StrategyRoundRobin and StrategySticky.
// Unknown values fall back to StrategyRoundRobin.
func (p *Pool) SetStrategy(strategy string) {
	switch strategy {
	case StrategySticky, StrategyRoundRobin:
	default:
		strategy = StrategyRoundRobin
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.strategy == strategy {
		return
	}
	p.strategy = strategy
	// Wake waiters so they re-evaluate with the new strategy in mind.
	p.notifyWaiterLocked()
}

// Strategy returns the current strategy name, primarily for admin diagnostics.
func (p *Pool) Strategy() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.strategy == "" {
		return StrategyRoundRobin
	}
	return p.strategy
}

func (p *Pool) Reset() {
	accounts := p.store.Accounts()
	sort.SliceStable(accounts, func(i, j int) bool {
		iHas := accounts[i].Token != ""
		jHas := accounts[j].Token != ""
		if iHas == jHas {
			return i < j
		}
		return iHas
	})
	ids := make([]string, 0, len(accounts))
	for _, a := range accounts {
		id := a.Identifier()
		if id != "" {
			ids = append(ids, id)
		}
	}
	if p.store != nil {
		p.maxInflightPerAccount = p.store.RuntimeAccountMaxInflight()
	} else {
		p.maxInflightPerAccount = maxInflightFromEnv()
	}
	recommended := defaultRecommendedConcurrency(len(ids), p.maxInflightPerAccount)
	queueLimit := maxQueueFromEnv(recommended)
	globalLimit := recommended
	if p.store != nil {
		queueLimit = p.store.RuntimeAccountMaxQueue(recommended)
		globalLimit = p.store.RuntimeGlobalMaxInflight(recommended)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.drainWaitersLocked()
	p.queue = ids
	p.inUse = map[string]int{}
	p.recommendedConcurrency = recommended
	p.maxQueueSize = queueLimit
	p.globalMaxInflight = globalLimit
	config.Logger.Info(
		"[init_account_queue] initialized",
		"total", len(ids),
		"max_inflight_per_account", p.maxInflightPerAccount,
		"global_max_inflight", p.globalMaxInflight,
		"recommended_concurrency", p.recommendedConcurrency,
		"max_queue_size", p.maxQueueSize,
	)
}

func (p *Pool) Release(accountID string) {
	if accountID == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	count := p.inUse[accountID]
	if count <= 0 {
		return
	}
	if count == 1 {
		delete(p.inUse, accountID)
		p.notifyWaiterLocked()
		return
	}
	p.inUse[accountID] = count - 1
	p.notifyWaiterLocked()
}

func (p *Pool) Status() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	available := make([]string, 0, len(p.queue))
	inUseAccounts := make([]string, 0, len(p.inUse))
	mutedAccounts := make([]string, 0)
	inUseSlots := 0
	for _, id := range p.queue {
		if p.muteStore != nil && p.muteStore.IsActiveMuted(id) {
			mutedAccounts = append(mutedAccounts, id)
			continue
		}
		if p.inUse[id] < p.maxInflightPerAccount {
			available = append(available, id)
		}
	}
	for id, count := range p.inUse {
		if count > 0 {
			inUseAccounts = append(inUseAccounts, id)
			inUseSlots += count
		}
	}
	sort.Strings(inUseAccounts)
	sort.Strings(mutedAccounts)
	strategy := p.strategy
	if strategy == "" {
		strategy = StrategyRoundRobin
	}
	return map[string]any{
		"available":                len(available),
		"in_use":                   inUseSlots,
		"muted":                    len(mutedAccounts),
		"total":                    len(p.store.Accounts()),
		"available_accounts":       available,
		"in_use_accounts":          inUseAccounts,
		"muted_accounts":           mutedAccounts,
		"max_inflight_per_account": p.maxInflightPerAccount,
		"global_max_inflight":      p.globalMaxInflight,
		"recommended_concurrency":  p.recommendedConcurrency,
		"waiting":                  len(p.waiters),
		"max_queue_size":           p.maxQueueSize,
		"strategy":                 strategy,
	}
}
