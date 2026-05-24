// Package mutescan implements the background sweep that polls
// DeepSeek's /api/v0/users/current endpoint for every configured account and
// updates the mutestate.Store with the latest mute status. The pool consults
// that store when picking an account so silently-muted accounts get skipped
// without burning a real chat request to discover their state.
package mutescan

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"ds2api/internal/account/mutestate"
	"ds2api/internal/config"
	dsclient "ds2api/internal/deepseek/client"
)

// maxScanConcurrency caps how many users/current calls run in parallel during
// a single sweep so we never hammer DeepSeek with a burst from a large pool.
const maxScanConcurrency = 4

// Scanner is the periodic mute-status sweeper. It owns one background goroutine
// started via Start and stopped via Stop or by cancelling the context passed
// to Start. Manual sweeps may be requested with RefreshNow.
type Scanner struct {
	store     *config.Store
	client    *dsclient.Client
	muteStore *mutestate.Store

	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}

	scanning atomic.Bool
}

// Summary describes the outcome of a single sweep over the configured accounts.
type Summary struct {
	Checked int `json:"checked"`
	Muted   int `json:"muted"`
	Failed  int `json:"failed"`
}

// New constructs a Scanner. Pass non-nil values; nil arguments make Start a
// no-op so callers that decide to disable the feature at runtime can skip
// wiring without panics elsewhere.
func New(store *config.Store, client *dsclient.Client, muteStore *mutestate.Store) *Scanner {
	return &Scanner{
		store:     store,
		client:    client,
		muteStore: muteStore,
	}
}

// Start launches the periodic sweep goroutine. The supplied context bounds the
// goroutine lifetime; closing it (or calling Stop) terminates the worker.
// Calling Start twice without an intervening Stop replaces the old goroutine.
func (s *Scanner) Start(ctx context.Context) {
	if s == nil || s.muteStore == nil || s.client == nil || s.store == nil {
		return
	}
	s.mu.Lock()
	if s.cancel != nil {
		s.mu.Unlock()
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	derived, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	s.cancel = cancel
	s.done = done
	s.mu.Unlock()

	go s.run(derived, done)
}

// Stop signals the background goroutine to exit and waits for it to finish.
// Safe to call multiple times; calls after the first are no-ops.
func (s *Scanner) Stop() {
	if s == nil {
		return
	}
	s.mu.Lock()
	cancel := s.cancel
	done := s.done
	s.cancel = nil
	s.done = nil
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

// RefreshNow runs one sweep synchronously and returns the per-sweep summary.
// It is safe to invoke even when the background loop is also running; the
// scanner prevents two sweeps from racing so the worst case is that one of the
// two sweeps observes scanning=true and returns the empty summary unchanged.
func (s *Scanner) RefreshNow(ctx context.Context) (Summary, error) {
	if s == nil || s.muteStore == nil || s.client == nil || s.store == nil {
		return Summary{}, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return s.runOnce(ctx), nil
}

func (s *Scanner) run(ctx context.Context, done chan struct{}) {
	defer close(done)
	// Kick off an immediate sweep so the store has data before the first
	// interval elapses. Skip when the context is already cancelled.
	if ctx.Err() == nil {
		summary := s.runOnce(ctx)
		config.Logger.Info(
			"[mute_scan] initial sweep complete",
			"checked", summary.Checked,
			"muted", summary.Muted,
			"failed", summary.Failed,
		)
	}

	for {
		interval := s.intervalDuration()
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		summary := s.runOnce(ctx)
		config.Logger.Info(
			"[mute_scan] sweep complete",
			"checked", summary.Checked,
			"muted", summary.Muted,
			"failed", summary.Failed,
			"interval_seconds", int(interval.Seconds()),
		)
	}
}

func (s *Scanner) intervalDuration() time.Duration {
	secs := 43200
	if s.store != nil {
		if v := s.store.RuntimeMuteScanIntervalSeconds(); v > 0 {
			secs = v
		}
	}
	if secs < 30 {
		secs = 30
	}
	return time.Duration(secs) * time.Second
}

// runOnce performs a single sweep. It snapshots the configured accounts,
// scans them with bounded concurrency, updates mutestate.Store, then prunes
// removed accounts from the store. Returns a per-sweep Summary.
func (s *Scanner) runOnce(ctx context.Context) Summary {
	if !s.scanning.CompareAndSwap(false, true) {
		return Summary{}
	}
	defer s.scanning.Store(false)

	if ctx == nil {
		ctx = context.Background()
	}
	accounts := s.store.Accounts()

	activeIDs := make(map[string]struct{}, len(accounts))
	for _, acc := range accounts {
		if id := acc.Identifier(); id != "" {
			activeIDs[id] = struct{}{}
		}
	}

	var (
		mu      sync.Mutex
		summary Summary
	)

	sem := make(chan struct{}, maxScanConcurrency)
	var wg sync.WaitGroup
	for _, acc := range accounts {
		acc := acc
		id := acc.Identifier()
		if id == "" {
			continue
		}
		if ctx.Err() != nil {
			break
		}
		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			break
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			result, err := s.client.FetchUsersCurrentForAccount(ctx, acc)
			status := mutestate.Status{CheckedAt: time.Now()}
			if err != nil {
				status.LastError = err.Error()
				// Preserve previously-known mute window if any.
				if prev, ok := s.muteStore.Get(id); ok {
					status.IsMuted = prev.IsMuted
					status.MuteUntil = prev.MuteUntil
				}
				s.muteStore.Set(id, status)
				mu.Lock()
				summary.Checked++
				summary.Failed++
				mu.Unlock()
				return
			}
			if result != nil {
				status.IsMuted = result.IsMuted
				status.MuteUntil = result.MuteUntil
			}
			s.muteStore.Set(id, status)
			mu.Lock()
			summary.Checked++
			if status.IsMuted {
				summary.Muted++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	// Drop entries for accounts removed from the config since the last sweep.
	s.muteStore.Retain(activeIDs)
	return summary
}
