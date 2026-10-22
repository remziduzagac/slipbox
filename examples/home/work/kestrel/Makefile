# Kestrel build targets. Recipes are indented with tabs, as make insists.
include build.mk

SHELL := /bin/bash
NODE_BIN := node_modules/.bin
VERSION := $(shell node -p "require(\"./package.json\").version")

.PHONY: all dev web api engine test release clean docs help

all: web api engine

help: ## list the targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/ -/'

dev: ## run the stack for local work
	docker compose up -d postgres redis tiles
	$(NODE_BIN)/vite --port 5173 &
	cd api && python -m kestrel_api --reload

web: ## build the web app into build/
	$(NODE_BIN)/tsc --noEmit
	$(NODE_BIN)/vite build --outDir build/web

api: ## install the API into its venv
	python -m venv api/.venv
	api/.venv/bin/pip install -e "api/[test]"

engine: ## build the route engine
	cargo build --release --locked -p route-engine
	@echo "engine built: target/release/route-engine"

test: ## everything CI runs
	npm test
	pytest api/ -q
	cargo test --workspace --locked

docs: ## the site, and docs/generated/api.md
	python -m mkdocs build --strict
	python api/scripts/gen_reference.py > docs/generated/api.md

release: test web engine ## cut a release: make release VERSION=2.4.0
	@test -n "$(VERSION)" || { echo "VERSION is required"; exit 1; }
	./scripts/release.sh $(VERSION)

clean:
	rm -rf build target tmp coverage
