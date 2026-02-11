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

CMD ["npm", "run", "cli:run"]
