# Forex Risk Management Bot

A production-ready Telegram bot that helps traders calculate position sizes, risk, and take‑profit levels based on account balance and risk percentage.

## Features
- One‑time setup: account balance, risk %, currency, default symbol.
- Automatic calculation from entry and stop‑loss only.
- Supports Forex, Gold (XAUUSD), Silver (XAGUSD), Indices, and Crypto.
- Displays TP levels from 1:1 to 1:10.
- Persistent settings and trade history using SQLite.
- Beautiful inline keyboards and premium result formatting.

## Deployment on Render
1. Push this repository to GitHub.
2. Create a new Web Service on Render.
3. Set environment variable `BOT_TOKEN`.
4. Use `npm start` as the start command.

## Local Development
1. Copy `.env.example` to `.env` and fill in your bot token.
2. Run `npm install`.
3. Run `npm start`.
