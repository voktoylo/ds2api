package client

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"ds2api/internal/account/mutestate"
	"ds2api/internal/auth"
	"ds2api/internal/config"
	trans "ds2api/internal/deepseek/transport"
	"ds2api/internal/devcapture"
	"ds2api/internal/util"
)

// intFrom is a package-internal alias for the shared util version.
var intFrom = util.IntFrom

type Client struct {
	Store      *config.Store
	Auth       *auth.Resolver
	capture    *devcapture.Store
	regular    trans.Doer
	stream     trans.Doer
	fallback   *http.Client
	fallbackS  *http.Client
	maxRetries int
	muteStore  *mutestate.Store

	proxyClientsMu sync.RWMutex
	proxyClients   map[string]requestClients
}

func NewClient(store *config.Store, resolver *auth.Resolver) *Client {
	return &Client{
		Store:        store,
		Auth:         resolver,
		capture:      devcapture.Global(),
		regular:      trans.New(60 * time.Second),
		stream:       trans.New(0),
		fallback:     &http.Client{Timeout: 60 * time.Second},
		fallbackS:    &http.Client{Timeout: 0},
		maxRetries:   3,
		proxyClients: map[string]requestClients{},
	}
}

// AttachMuteStore wires the optional mute-state store so the client can
// reactively record per-account mute hits seen in DeepSeek responses
// (biz_code=14 user is muted) without waiting for the next background sweep.
func (c *Client) AttachMuteStore(s *mutestate.Store) {
	if c == nil {
		return
	}
	c.muteStore = s
}

// markAccountMuted is called when a DeepSeek response indicates the account
// is currently muted. We set a 24h mute_until window optimistically — the next
// scheduled scan will overwrite it with the authoritative value from
// /users/current. No-op when muteStore is unset or accountID is empty.
func (c *Client) markAccountMuted(accountID, reason string) {
	if c == nil || c.muteStore == nil || strings.TrimSpace(accountID) == "" {
		return
	}
	now := time.Now()
	c.muteStore.Set(accountID, mutestate.Status{
		IsMuted:   true,
		MuteUntil: now.Add(24 * time.Hour),
		CheckedAt: now,
		LastError: reason,
	})
}

// isMutedBizResponse classifies a DeepSeek response as "this account is
// muted" using both biz_code (14) and biz_msg/msg text fallbacks so we still
// catch the signal if DeepSeek renumbers later.
func isMutedBizResponse(bizCode int, msg, bizMsg string) bool {
	if bizCode == 14 {
		return true
	}
	hay := strings.ToLower(msg + " " + bizMsg)
	return strings.Contains(hay, "user is muted") || strings.Contains(hay, "account is muted")
}

// PreloadPow 保留兼容接口，纯 Go 实现无需预加载。
func (c *Client) PreloadPow(_ context.Context) error {
	return nil
}
