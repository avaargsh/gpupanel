package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
)

const trustedUvVersion = "0.13.3"
const trustedUvAsset = "uv-x86_64-unknown-linux-gnu.tar.gz"
const trustedUvArchiveSHA = "e4f169ec380f1793b898a6f1fcbacd22db25cf7ca0349a6e96ffb85b69998d04"
const trustedUvBinarySHA = "90c2ff84aa2a76a1ae70454ede3c6a9a4a40c786ccbf777148341a05cb583018"

type managedUvReceipt struct {
	Version string `json:"version"`
	Asset string `json:"asset"`
	ArchiveSHA256 string `json:"archiveSHA256"`
	BinarySHA256 string `json:"binarySHA256"`
}

// Only a verified GPUPanel-managed user-local uv may be injected into the
// embedded worker's PATH. The global shell configuration is never modified.
func verifiedManagedUvBin(home string) (string, bool) {
	return verifiedManagedUvBinWithExpectedDigest(home, trustedUvBinarySHA)
}

// The digest override exists only for hermetic unit tests. All runtime calls
// use the immutable ELF hash derived from the verified upstream tarball.
func verifiedManagedUvBinWithExpectedDigest(home, expectedDigest string) (string, bool) {
	if home == "" || !filepath.IsAbs(home) || !digestPattern.MatchString(expectedDigest) { return "", false }
	root := filepath.Join(home, "GPUPanel", "tools", "uv", trustedUvVersion)
	binDir := filepath.Join(root, "bin")
	for _, dir := range []string{home, filepath.Join(home, "GPUPanel"),
		filepath.Join(home, "GPUPanel", "tools"),
		filepath.Join(home, "GPUPanel", "tools", "uv"), root, binDir} {
		st, err := os.Lstat(dir)
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return "", false
		}
	}
	binary := filepath.Join(binDir, "uv")
	receipt := filepath.Join(root, "receipt.json")
	for _, path := range []string{binary, receipt} {
		st, err := os.Lstat(path)
		if err != nil || !st.Mode().IsRegular() || st.Mode()&os.ModeSymlink != 0 {
			return "", false
		}
	}
	info, err := os.Stat(binary)
	if err != nil || info.Size() > 90*1024*1024 || info.Size() < 1 || info.Mode().Perm()&0100 == 0 {
		return "", false
	}
	meta, err := os.Stat(receipt)
	if err != nil || meta.Size() > 2048 { return "", false }
	data, err := os.ReadFile(receipt)
	if err != nil { return "", false }
	var r managedUvReceipt
	if json.Unmarshal(data, &r) != nil || r.Version != trustedUvVersion ||
		r.Asset != trustedUvAsset || r.ArchiveSHA256 != trustedUvArchiveSHA ||
		r.BinarySHA256 != expectedDigest {
		return "", false
	}
	f, err := os.Open(binary)
	if err != nil { return "", false }
	defer f.Close()
	sum := sha256.New()
	if _, err = io.Copy(sum, io.LimitReader(f, 90*1024*1024+1)); err != nil {
		return "", false
	}
	if hex.EncodeToString(sum.Sum(nil)) != expectedDigest { return "", false }
	return binDir, true
}
