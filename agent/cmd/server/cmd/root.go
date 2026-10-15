package cmd

import (
	"github.com/avaargsh/GPUPanel/agent/server"
	"github.com/spf13/cobra"
)

var RootCmd = &cobra.Command{
	Use: "gpupanel-agent",
	RunE: func(cmd *cobra.Command, args []string) error {
		server.Start()
		return nil
	},
}
