# Local dev. `make dev` needs Docker (Azurite) and Azure Functions Core Tools (`npm i -g azure-functions-core-tools@4`).
.PHONY: test sync install serve azurite dev

test: ## model + server-validation tests
	node test.js

sync: ## copy the shared model into the API (api/ is deployed separately and can't import from src/)
	cp src/logic.js api/logic.js

install:
	cd api && npm install
	test -f api/local.settings.json || cp api/local.settings.example.json api/local.settings.json

serve: ## game only, no top lists (http://localhost:8000)
	python3 -m http.server 8000 -d src

azurite: ## local Table Storage emulator on :10002
	docker run -d --rm --name azurite -p 10002:10002 mcr.microsoft.com/azure-storage/azurite azurite-table --tableHost 0.0.0.0

dev: sync install ## full site + API like Azure (http://localhost:4280); run `make azurite` first
	npx -y @azure/static-web-apps-cli start src --api-location api
