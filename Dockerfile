FROM node:18-alpine

WORKDIR /app

# Copia file di dipendenze
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Installa dipendenze
RUN npm ci --omit=dev

# Genera Prisma Client
RUN npx prisma generate

# Copia sorgenti compilati
COPY dist ./dist/
COPY .env* ./

# Il database SQLite viene creato automaticamente al primo avvio
ENV DATABASE_URL=file:/app/data.db

CMD ["npm", "run", "cli:run"]
