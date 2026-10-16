package migrations

import "testing"

func TestInitialBindAddress(t *testing.T) {
	for _, test := range []struct{ input, want string }{{"", "0.0.0.0"}, {"127.0.0.1", "127.0.0.1"}, {"0.0.0.0", "0.0.0.0"}} {
		got, err := initialBindAddress(test.input)
		if err != nil || got != test.want {
			t.Fatalf("%q: %q, %v", test.input, got, err)
		}
	}
	for _, input := range []string{"localhost", "127.0.0.1;cmd", "127.0.0.1\n", "::1", "192.0.2.1"} {
		if _, err := initialBindAddress(input); err == nil {
			t.Fatalf("accepted invalid or unsupported bind %q", input)
		}
	}
}
