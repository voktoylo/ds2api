package account

import (
	"context"

	"ds2api/internal/config"
)

func (p *Pool) Acquire(target string, exclude map[string]bool) (config.Account, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.acquireLocked(target, normalizeExclude(exclude))
}

func (p *Pool) AcquireWait(ctx context.Context, target string, exclude map[string]bool) (config.Account, bool) {
	if ctx == nil {
		ctx = context.Background()
	}
	exclude = normalizeExclude(exclude)
	for {
		if ctx.Err() != nil {
			return config.Account{}, false
		}

		p.mu.Lock()
		if acc, ok := p.acquireLocked(target, exclude); ok {
			p.mu.Unlock()
			return acc, true
		}
		if !p.canQueueLocked(target, exclude) {
			p.mu.Unlock()
			return config.Account{}, false
		}
		waiter := make(chan struct{})
		p.waiters = append(p.waiters, waiter)
		p.mu.Unlock()

		select {
		case <-ctx.Done():
			p.mu.Lock()
			p.removeWaiterLocked(waiter)
			p.mu.Unlock()
			return config.Account{}, false
		case <-waiter:
		}
	}
}

func (p *Pool) acquireLocked(target string, exclude map[string]bool) (config.Account, bool) {
	if target != "" {
		if exclude[target] || !p.canAcquireIDLocked(target) {
			return config.Account{}, false
		}
		if p.isMutedLocked(target) {
			return config.Account{}, false
		}
		acc, ok := p.store.FindAccount(target)
		if !ok {
			return config.Account{}, false
		}
		p.inUse[target]++
		p.bumpQueueAfterAcquire(target)
		return acc, true
	}

	return p.tryAcquire(exclude)
}

func (p *Pool) tryAcquire(exclude map[string]bool) (config.Account, bool) {
	for i := 0; i < len(p.queue); i++ {
		id := p.queue[i]
		if exclude[id] || !p.canAcquireIDLocked(id) {
			continue
		}
		if p.isMutedLocked(id) {
			continue
		}
		acc, ok := p.store.FindAccount(id)
		if !ok {
			continue
		}
		p.inUse[id]++
		p.bumpQueueAfterAcquire(id)
		return acc, true
	}
	return config.Account{}, false
}

// isMutedLocked reports whether the configured mute store flags the account as
// currently muted. The caller must hold p.mu.
func (p *Pool) isMutedLocked(accountID string) bool {
	if p.muteStore == nil {
		return false
	}
	return p.muteStore.IsActiveMuted(accountID)
}

// bumpQueueAfterAcquire moves the just-acquired account based on the active
// strategy. Round-robin sends it to the back; sticky keeps it in place so
// future calls keep selecting it until it becomes muted or saturated.
func (p *Pool) bumpQueueAfterAcquire(accountID string) {
	if p.strategy == StrategySticky {
		// Sticky: keep position so the same account is reused. But pull the
		// chosen account to the head if it's not already, so once a request
		// lands on a working account the pool keeps preferring it.
		p.pullToFront(accountID)
		return
	}
	p.bumpQueue(accountID)
}

// pullToFront moves accountID to position 0 of the queue. No-op when it is
// already at the head or not present.
func (p *Pool) pullToFront(accountID string) {
	for i, id := range p.queue {
		if id != accountID {
			continue
		}
		if i == 0 {
			return
		}
		p.queue = append(p.queue[:i], p.queue[i+1:]...)
		p.queue = append([]string{accountID}, p.queue...)
		return
	}
}

func (p *Pool) bumpQueue(accountID string) {
	for i, id := range p.queue {
		if id != accountID {
			continue
		}
		p.queue = append(p.queue[:i], p.queue[i+1:]...)
		p.queue = append(p.queue, accountID)
		return
	}
}

func normalizeExclude(exclude map[string]bool) map[string]bool {
	if exclude == nil {
		return map[string]bool{}
	}
	return exclude
}
