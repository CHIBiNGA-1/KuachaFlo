FROM node:20-alpine

WORKDIR /app

# Install deps first (separate layer — cached unless package-lock.json changes)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source (will be overridden by volume mounts in dev)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
