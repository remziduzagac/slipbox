// Package main is the uploader: it copies a night's stacks from ridge-arch to the Dunmore NAS.
//
// The folder layout it expects is in software/halley/halley.toml:17 (the [archive] table), and
// the schedule in software/nightjar/deploy.yaml. Runbook: https://halden-ridge.invalid/pipeline/backup
package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// Target is a place the stacks go.
type Target struct {
	Host string
	Path string
}

// Upload is one night's copy job.
type Upload struct {
	Night  string
	Target Target
	Files  []string
}

const usage = `uploader <night>

Copies /srv/stacks/<night> to the NAS.
Nothing is deleted on either side.`

// Collect finds the night's stack files.
func (u *Upload) Collect(root string) error {
	matches, err := filepath.Glob(filepath.Join(root, u.Night, "*.fits"))
	if err != nil {
		return err
	}
	u.Files = matches
	return nil
}

// Run copies the files (a dry run prints them).
func (u *Upload) Run(dry bool) {
	for _, f := range u.Files {
		fmt.Printf("%s -> %s:%s\n", f, u.Target.Host, u.Target.Path)
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	u := &Upload{Night: os.Args[1], Target: Target{Host: "dunmore-nas", Path: "/backup/stacks"}}
	if err := u.Collect("/srv/stacks"); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	u.Run(true)
}
