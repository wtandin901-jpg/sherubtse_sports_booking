# Sherubtse Sports Ground Booking Management System

Node.js + Express + EJS + PostgreSQL. Full instructions are in the companion guide.

Quick start (Windows PowerShell, from this folder):

    Copy-Item .env.example .env        # then edit DB_PASSWORD and SESSION_SECRET
    npm install
    npm run db:setup                    # create the database first in pgAdmin
    npm run admin:create
    npm run dev                         # http://localhost:3000

Tests (needs a second, empty database `sherubtse_sports_booking_test` and `.env.test`):

    npm run db:setup:test
    npm test
