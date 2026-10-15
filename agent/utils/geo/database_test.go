package geo

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/oschwald/maxminddb-golang"
)

func TestDatabaseURL(t *testing.T) {
	if got := DatabaseURL(); got != "https://resource.fit2cloud.com/1panel/package/v2/geo/GeoIP.mmdb" {
		t.Fatal(got)
	}
}

func TestFailedDownloadPreservesTarget(t *testing.T) {
	for _, status := range []int{200, 404, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			target := filepath.Join(t.TempDir(), "GeoIP.mmdb")
			original := []byte("existing data must survive a failed replacement")
			if err := os.WriteFile(target, original, 0644); err != nil {
				t.Fatal(err)
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte("not an MMDB"))
			}))
			defer server.Close()
			if err := DownloadDatabase(server.URL, target); err == nil {
				t.Fatal("accepted HTTP error or invalid database")
			}
			got, err := os.ReadFile(target)
			if err != nil || !bytes.Equal(original, got) {
				t.Fatalf("changed existing target: %q, %v", got, err)
			}
			files, _ := filepath.Glob(filepath.Join(filepath.Dir(target), ".GeoIP-*"))
			if len(files) != 0 {
				t.Fatalf("temporary files leaked: %v", files)
			}
		})
	}
}

// Optional integration fixture is fetched from the documented upstream URL;
// ordinary unit tests remain offline and do not silently download external data.
func TestRealDatabase(t *testing.T) {
	fixture := os.Getenv("GPUPANEL_GEOIP_TEST_FILE")
	if fixture == "" {
		t.Skip("set GPUPANEL_GEOIP_TEST_FILE for real database integration")
	}
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(t.TempDir(), "geo", "GeoIP.mmdb")
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := InstallDatabase(bytes.NewReader(data), target); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if err := ValidateDatabase(target); err != nil {
		t.Fatal(err)
	}
	reader, err := maxminddb.Open(target)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	for _, lang := range []string{"en", "zh"} {
		location, err := GetIPLocation(reader, "8.8.8.8", lang)
		if err != nil || strings.TrimSpace(location) == "" {
			t.Fatalf("incompatible lookup: %q, %v", location, err)
		}
		t.Logf("8.8.8.8 (%s): %s", lang, location)
	}
	if err := InstallDatabase(bytes.NewReader(data[:len(data)/2]), target); err == nil {
		t.Fatal("accepted truncated database")
	}
	got, err := os.ReadFile(target)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatal("failed update damaged valid database")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(data) }))
	defer server.Close()
	if err := DownloadDatabase(server.URL, target); err != nil {
		t.Fatal(err)
	}
}
