package accounts

import (
	"encoding/json"
	"net/http"
	"strings"

	"ds2api/internal/config"
)

// deleteBatch removes multiple accounts in a single request and reports
// per-identifier failures so the WebUI can surface them.
func (h *Handler) deleteBatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Identifiers []string `json:"identifiers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "invalid json"})
		return
	}
	identifiers := make([]string, 0, len(req.Identifiers))
	seen := map[string]struct{}{}
	for _, id := range req.Identifiers {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		identifiers = append(identifiers, id)
	}
	if len(identifiers) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "identifiers is required"})
		return
	}

	type failure struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	failed := make([]failure, 0)
	deleted := 0
	updateErr := h.Store.Update(func(c *config.Config) error {
		kept := make([]config.Account, 0, len(c.Accounts))
		removeSet := make(map[string]struct{}, len(identifiers))
		for _, id := range identifiers {
			removeSet[id] = struct{}{}
		}
		matched := make(map[string]struct{}, len(identifiers))
		for _, acc := range c.Accounts {
			drop := false
			for id := range removeSet {
				if accountMatchesIdentifier(acc, id) {
					matched[id] = struct{}{}
					drop = true
					break
				}
			}
			if drop {
				continue
			}
			kept = append(kept, acc)
		}
		deleted = len(matched)
		for _, id := range identifiers {
			if _, ok := matched[id]; !ok {
				failed = append(failed, failure{ID: id, Reason: "账号不存在"})
			}
		}
		c.Accounts = kept
		return nil
	})
	if updateErr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": updateErr.Error()})
		return
	}
	if deleted > 0 {
		h.Pool.Reset()
		if h.MuteStore != nil {
			active := map[string]struct{}{}
			for _, acc := range h.Store.Snapshot().Accounts {
				if id := acc.Identifier(); id != "" {
					active[id] = struct{}{}
				}
			}
			h.MuteStore.Retain(active)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":        true,
		"deleted_count":  deleted,
		"total_accounts": len(h.Store.Snapshot().Accounts),
		"failed":         failed,
	})
}

// refreshMute triggers an immediate mute sweep and returns its summary.
// Returns 503 when the scanner is not wired (e.g. running under a stripped-
// down test harness).
func (h *Handler) refreshMute(w http.ResponseWriter, r *http.Request) {
	if h.Scanner == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "mute scanner unavailable"})
		return
	}
	summary, err := h.Scanner.RefreshNow(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"checked": summary.Checked,
		"muted":   summary.Muted,
		"failed":  summary.Failed,
	})
}

// muteStatus returns the complete mute-state snapshot keyed by account
// identifier. Empty map when no scanner/store is wired.
func (h *Handler) muteStatus(w http.ResponseWriter, r *http.Request) {
	if h.MuteStore == nil {
		writeJSON(w, http.StatusOK, map[string]any{"items": map[string]any{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": h.MuteStore.Snapshot()})
}
