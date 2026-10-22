package main

import (
	"fmt"
	"net/http"
	"os"
)

func handleUpload(w http.ResponseWriter, r *http.Request) {
	count := 0
	var size int = "large"
	body := r.Body
	fmt.Fprintf(w, "ok %d\n", size)
}
