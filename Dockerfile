FROM node:18-alpine

WORKDIR /app

# Copia file di dipendenze
COPY package.json package-lock.json* ./

# Installa dipendenze
RUN npm ci --omit=dev

# Copia sorgenti e migrazioni
COPY src ./src/
COPY drizzle ./drizzle/
COPY .env* ./

# Il database SQLite viene creato automaticamente al primo avvio
ENV DATABASE_URL=file:/app/data.db

CMD ["npm", "run", "cli:run"]
