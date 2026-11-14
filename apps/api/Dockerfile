# The Plotpal API as a container image, for Fly.io.
#
# Build from the REPOSITORY ROOT (the lock file and the workspace live there):
#   docker build -f apps/api/Dockerfile -t plotpal-api .
#
# Two stages. The first installs only what production needs, exactly as the lock file says. The second
# is a small Node image with nothing in it but that, the source and the migrations; it runs as an
# ordinary user, not as root. Both base images are pinned to an exact digest, so a build today and a
# build next year start from the same bytes. To update them: pull the new tag, read its digest with
# `docker image inspect <image> --format '{{index .RepoDigests 0}}'`, and paste it here.

# --- Stage 1: install the production dependencies -----------------------------------------------
# bun 1.4.3 (debian): the same Linux family (glibc) as the run stage, so native modules such as the
# password hasher are installed in the form they will run in.
FROM oven/bun:1.4.3-debian@sha256:923bedb355f7746666659f71e724998159a5c8c54bd1cb1030e1975a0698415b AS deps
WORKDIR /app
# Only the manifests: the install is cached until a dependency changes. The web app's manifest is
# needed because the lock file covers the whole workspace.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production --filter @plotpal/api

# --- Stage 2: run ---------------------------------------------------------------------------------
# Node 24 (the current long-term-support line), Debian bookworm, slim.
FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/ ./
# The source and the migrations. The tests are left out by .dockerignore.
COPY --chown=node:node apps/api/src apps/api/src
COPY --chown=node:node apps/api/drizzle apps/api/drizzle

# The migration command in fly.toml (node src/db/migrate-cli.ts) runs from here too.
WORKDIR /app/apps/api
USER node
EXPOSE 8080

# Fly has its own check (fly.toml); this one is for `docker run` and any other host.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT ?? 8080}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# The server itself, not `bun run start`: that script reads a .env file, and there is none here. The
# settings come from the environment (fly.toml for the plain ones, `fly secrets` for the secret ones).
CMD ["node", "src/server.ts"]
