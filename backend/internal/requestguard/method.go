// SPDX-License-Identifier: Apache-2.0

package requestguard

import "net/http"

// IsSafeMethod reports whether method has read-only HTTP semantics for this
// slice. Only the exact, case-sensitive RFC 7231 safe methods GET, HEAD and
// OPTIONS are safe. Everything else - POST, PUT, PATCH, DELETE, custom verbs,
// lowercase variants and the empty method - is classified unsafe and therefore
// requires CSRF validation. The rule is deliberately fail-closed: an
// unrecognized method is never assumed safe.
//
// POST is unsafe here even when an endpoint uses it for a read-only Host
// diagnosis call, because the request is state-changing at the HTTP level and
// must pass the trusted CSRF validator.
func IsSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}
