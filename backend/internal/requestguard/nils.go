// SPDX-License-Identifier: Apache-2.0

package requestguard

import "reflect"

// isNilDependency reports whether x is unusable as an injected dependency: an
// untyped nil interface, or a typed-nil interface value such as a nil pointer
// implementation or a nil function adapter (AuthenticatorFunc(nil)). Such a
// value is non-nil as an interface yet panics when its method is invoked, so
// New must reject it instead of accepting a Guard that panics per request.
//
// Only nilable kinds can be typed-nil; any other concrete value is usable.
func isNilDependency(x any) bool {
	if x == nil {
		return true
	}
	switch v := reflect.ValueOf(x); v.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map,
		reflect.Pointer, reflect.Slice, reflect.UnsafePointer:
		return v.IsNil()
	default:
		return false
	}
}
