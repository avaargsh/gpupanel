// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"encoding/json"
	"net/http"
)

// envelope is the controlled JSON body shape for every middleware refusal:
// {code, message, data}. It mirrors the externally visible Core response
// contract without importing it, and it never carries error, session, token
// or header detail.
type envelope struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// Fixed, non-diagnostic refusal messages. Callers must not build these from
// runtime error text, so no secret or upstream failure detail can leak.
const (
	msgUnauthorized = "unauthorized"
	msgForbidden    = "forbidden"
	msgUnavailable  = "service unavailable"
)

// writeRefusal emits one controlled JSON refusal with a non-diagnostic body.
// It sets no cookies and no auth/session headers.
func writeRefusal(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	// Encoder errors are intentionally dropped: the body is a constant shape
	// and there is nothing safe or useful to report to the client.
	_ = json.NewEncoder(w).Encode(envelope{Code: status, Message: message, Data: nil})
}
