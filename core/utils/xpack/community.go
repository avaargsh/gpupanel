//go:build !xpack && !enterprise

package xpack

import "github.com/avaargsh/GPUPanel/core/utils/xpack/helper"

var AuthProvider = helper.NewIAuthProvider()

var MultiNodeProvider = helper.NewIMultiNodeProvider()
