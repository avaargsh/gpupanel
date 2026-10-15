package geo

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/oschwald/maxminddb-golang"
)

const maxDatabaseSize = 128 << 20

// DatabaseURL uses the package repository, not the shell-language resource tree.
// Kept in both independent Go modules so neither runtime depends on the other.
func DatabaseURL() string {
	return "https://resource.fit2cloud.com/1panel/package/v2/geo/GeoIP.mmdb"
}

func ValidateDatabase(filename string) error {
	reader, err := maxminddb.Open(filename)
	if err != nil {
		return err
	}
	defer reader.Close()
	// Upstream's custom database omits optional description metadata, so the
	// library's strict Verify rejects it. Decode every network instead, checking
	// tree/data integrity and the country/province schema actually used here.
	networks := reader.Networks(maxminddb.SkipAliasedNetworks)
	count := 0
	for networks.Next() {
		var location LocationRes
		if _, err := networks.Network(&location); err != nil {
			return err
		}
		count++
	}
	if err := networks.Err(); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("GeoIP database has no networks")
	}
	return nil
}

// InstallDatabase validates a private temporary file before atomic replacement.
// Concurrent Core/Agent starts never expose a partially written database.
func InstallDatabase(source io.Reader, target string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".GeoIP-*.mmdb")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	n, err := io.Copy(tmp, io.LimitReader(source, maxDatabaseSize+1))
	if err != nil {
		return err
	}
	if n > maxDatabaseSize {
		return fmt.Errorf("GeoIP database exceeds %d bytes", maxDatabaseSize)
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := ValidateDatabase(tmp.Name()); err != nil {
		return fmt.Errorf("invalid GeoIP database: %w", err)
	}
	if err := os.Chmod(tmp.Name(), 0644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), target)
}

func DownloadDatabase(url, target string) error {
	client := &http.Client{Timeout: 90 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("GeoIP download: HTTP %d", response.StatusCode)
	}
	return InstallDatabase(response.Body, target)
}
