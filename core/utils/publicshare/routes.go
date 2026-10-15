package publicshare

func IsAPI(path string) bool {
	switch path {
	case "/api/v1/files/share/info",
		"/api/v1/files/share/check",
		"/api/v1/files/share/download":
		return true
	default:
		return false
	}
}
