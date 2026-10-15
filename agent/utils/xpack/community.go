//go:build !xpack && !enterprise

package xpack

import "github.com/avaargsh/GPUPanel/agent/utils/xpack/helper"

var AlertProvider = helper.NewIAlertProvider()

var MultiNodeProvider = helper.NewIMultiNodeProvider()
