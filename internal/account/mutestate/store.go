// Package mutestate tracks per-account DeepSeek mute status detected via
// `/api/v0/users/current`. The pool consults this store when selecting
// accounts so that requests skip silently-muted accounts (which would
// otherwise return upstream_unavailable / upload file failed and waste
// retries).
package mutestate

import (
	"sort"
	"sync"
	"time"
)

// Status is the latest known DeepSeek mute state for one account.
type Status struct {
	IsMuted   bool      `json:"is_muted"`
	MuteUntil time.Time `json:"mute_until"` // zero value when never muted
	CheckedAt time.Time `json:"checked_at"`
	LastError string    `json:"last_error,omitempty"`
}

// Store is a goroutine-safe in-memory map of account identifier -> Status.
// State is intentionally non-persistent; it is rebuilt by the periodic scan
// after every restart.
type Store struct {
	mu     sync.RWMutex
	states map[string]Status
}

func New() *Store {
	return &Store{states: map[string]Status{}}
}

// Get returns the latest known status for accountID. The second return value
// reports whether any status has ever been recorded for the account.
func (s *Store) Get(accountID string) (Status, bool) {
	if accountID == "" {
		return Status{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.states[accountID]
	return v, ok
}

// Set records the latest known status for accountID.
func (s *Store) Set(accountID string, status Status) {
	if accountID == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states[accountID] = status
}

// Delete removes any recorded status for accountID. Called when an account
// is deleted from the config so the store does not leak entries.
func (s *Store) Delete(accountID string) {
	if accountID == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.states, accountID)
}

// Retain prunes states whose accountID is not in the supplied keep set.
// Call after the config store reloads to garbage-collect stale entries.
func (s *Store) Retain(keep map[string]struct{}) {
	if keep == nil {
		keep = map[string]struct{}{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for id := range s.states {
		if _, ok := keep[id]; !ok {
			delete(s.states, id)
		}
	}
}

// IsActiveMuted reports whether accountID is currently muted at time.Now().
// Returns false when no status is recorded or when mute_until has elapsed.
func (s *Store) IsActiveMuted(accountID string) bool {
	if accountID == "" {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.states[accountID]
	if !ok {
		return false
	}
	if !v.IsMuted {
		return false
	}
	if v.MuteUntil.IsZero() {
		// Backend says muted but did not provide an expiry; treat as muted.
		return true
	}
	return time.Now().Before(v.MuteUntil)
}

// Snapshot returns a copy of the full state map. Used by admin endpoints to
// expose mute info to the WebUI.
func (s *Store) Snapshot() map[string]Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]Status, len(s.states))
	for k, v := range s.states {
		out[k] = v
	}
	return out
}

// MutedAccountIDs returns the list of account identifiers that are currently
// muted, sorted alphabetically for deterministic output.
func (s *Store) MutedAccountIDs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now()
	ids := make([]string, 0)
	for id, v := range s.states {
		if !v.IsMuted {
			continue
		}
		if !v.MuteUntil.IsZero() && !now.Before(v.MuteUntil) {
			continue
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
