FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy lockfile and workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Copy common packages
COPY packages ./packages
# Copy the app to build
COPY apps/notification ./apps/notification

# Install dependencies for the whole workspace
RUN pnpm install --frozen-lockfile

# Build the app and internal packages
RUN pnpm run -r build

EXPOSE 3002

# Run the app
CMD [ "pnpm", "--filter", "@matcha/notification", "run", "start:prod" ]