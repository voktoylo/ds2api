package client

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ds2api/internal/config"
	dsprotocol "ds2api/internal/deepseek/protocol"
	"ds2api/internal/util"
)

// UsersCurrentResult is the parsed mute state returned by
// DeepSeek's /api/v0/users/current endpoint.
type UsersCurrentResult struct {
	IsMuted   bool
	MuteUntil time.Time // unix time of unlock; zero when not muted
	Raw       map[string]any
}

// FetchUsersCurrentForAccount calls GET /api/v0/users/current using the
// account's stored token and parses the chat mute state. This is the basis
// of the periodic mute scanner and the admin-triggered manual scan.
//
// It does not refresh the token on auth failure (the mute scanner is best-
// effort and the regular request path already handles token refresh on the
// chat endpoints). A nil result with a non-nil error indicates the call
// failed entirely (network, parse, or DeepSeek rejected the request).
func (c *Client) FetchUsersCurrentForAccount(ctx context.Context, acc config.Account) (*UsersCurrentResult, error) {
	token := strings.TrimSpace(acc.Token)
	if token == "" {
		return nil, errors.New("account has no token")
	}
	clients := c.requestClientsForAccount(acc)
	headers := c.authHeaders(token)
	resp, status, err := c.getJSONWithStatus(ctx, clients.regular, dsprotocol.DeepSeekUsersCurrentURL, headers)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("users/current http %d", status)
	}
	code, bizCode, msg, bizMsg := extractResponseStatus(resp)
	if code != 0 || bizCode != 0 {
		return nil, fmt.Errorf("users/current biz failure: code=%d biz_code=%d msg=%q biz_msg=%q", code, bizCode, msg, bizMsg)
	}
	data, _ := resp["data"].(map[string]any)
	bizData, _ := data["biz_data"].(map[string]any)
	chat, _ := bizData["chat"].(map[string]any)
	if chat == nil {
		// Not a fatal error — older accounts may not have a chat object.
		return &UsersCurrentResult{Raw: resp}, nil
	}
	isMuted := util.IntFrom(chat["is_muted"]) == 1
	var muteUntil time.Time
	if v, ok := chat["mute_until"]; ok && v != nil {
		switch x := v.(type) {
		case float64:
			if x > 0 {
				sec := int64(x)
				nsec := int64((x - float64(sec)) * float64(time.Second))
				muteUntil = time.Unix(sec, nsec)
			}
		case int64:
			if x > 0 {
				muteUntil = time.Unix(x, 0)
			}
		case int:
			if x > 0 {
				muteUntil = time.Unix(int64(x), 0)
			}
		}
	}
	return &UsersCurrentResult{IsMuted: isMuted, MuteUntil: muteUntil, Raw: resp}, nil
}
