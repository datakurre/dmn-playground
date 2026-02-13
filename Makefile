.PHONY: dev build preview test test-watch lint format format-check check build-feel-scala

dev:
	npm run dev

build:
	npm run build

build-feel-scala:
	$(MAKE) -C feel-scala

preview:
	npm run preview

test:
	npm run test

test-watch:
	npm run test:watch

lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

check: format-check lint test
