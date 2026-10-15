package service

// legacyRemoteCatalogEnabled is an intentionally fixed product boundary.
// A runtime environment variable must not silently re-enable untrusted upstream
// catalog synchronization. Existing installation records remain untouched.
func LegacyRemoteCatalogEnabled() bool { return false }
