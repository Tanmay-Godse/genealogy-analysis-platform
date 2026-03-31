ENV_NAME ?= family-tree

.PHONY: bootstrap install-web install-api dev-web dev-api test-api lint-web build-web

bootstrap: install-web install-api

install-web:
	micromamba run -n $(ENV_NAME) npm install --workspace apps/web

install-api:
	micromamba run -n $(ENV_NAME) bash -lc 'cd apps/api && uv pip install --system --python python -e .'

dev-web:
	micromamba run -n $(ENV_NAME) npm run dev --workspace apps/web

dev-api:
	micromamba run -n $(ENV_NAME) bash -lc 'cd apps/api && python -m uvicorn app.main:app --reload'

test-api:
	micromamba run -n $(ENV_NAME) bash -lc 'cd apps/api && python -m pytest'

lint-web:
	micromamba run -n $(ENV_NAME) npm run lint --workspace apps/web

build-web:
	micromamba run -n $(ENV_NAME) npm run build --workspace apps/web
